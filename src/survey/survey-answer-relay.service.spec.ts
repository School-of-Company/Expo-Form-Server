import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerRelayService } from './survey-answer-relay.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

const submission = {
  id: 'submission-1',
  surveyId: 'survey-1',
  expoId: 'expo-1',
  participationType: ParticipationType.TRAINEE,
  phoneNumber: '01012345678',
  eventId: 'event-1',
  status: SurveyAnswerSubmissionStatus.RECEIVED,
  payload: {
    answers: { '1': '좋았습니다' },
    personalInformationStatus: true,
  },
} as unknown as SurveyAnswerSubmissionEntity;

const questions = [
  {
    id: 1,
    title: '프로그램 만족도',
    order: 0,
    formType: DynamicFormFieldType.SENTENCE,
    jsonData: {},
    otherJson: null,
  },
];

/** 제출 당시의 문항 스냅샷이 저장된 접수 건. */
const submissionWithSnapshot = {
  ...submission,
  payload: { ...submission.payload, questions },
} as unknown as SurveyAnswerSubmissionEntity;

describe('SurveyAnswerRelayService', () => {
  let producer: { send: Mock };
  let kafka: { producer: Mock };
  let config: { get: Mock; getOrThrow: Mock };
  let store: {
    findReceived: Mock;
    findStalePublished: Mock;
    markPublished: Mock;
  };
  let service: SurveyAnswerRelayService;

  beforeEach(() => {
    producer = { send: vi.fn() };
    kafka = { producer: vi.fn().mockReturnValue(producer) };
    config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
      getOrThrow: vi.fn().mockReturnValue('survey.answer.submit'),
    };
    store = {
      findReceived: vi.fn().mockResolvedValue([]),
      findStalePublished: vi.fn().mockResolvedValue([]),
      markPublished: vi.fn(),
    };
    service = new SurveyAnswerRelayService(
      kafka as never,
      config as never,
      store as unknown as SurveyAnswerSubmissionStore,
    );
  });

  it('RECEIVED 건을 발행하고 markPublished를 호출한다', async () => {
    store.findReceived.mockResolvedValue([submission]);

    await service.relay();

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'survey.answer.submit',
      messages: [
        {
          key: 'survey-1:01012345678',
          value: JSON.stringify({
            eventId: 'event-1',
            version: 1,
            surveyId: 'survey-1',
            expoId: 'expo-1',
            participationType: ParticipationType.TRAINEE,
            phoneNumber: '01012345678',
            answerJson: JSON.stringify({ '1': '좋았습니다' }),
            personalInformationStatus: true,
          }),
        },
      ],
    });
    expect(store.markPublished).toHaveBeenCalledWith('submission-1', 1);
  });

  it('오래 머문 PUBLISHED 건도 같은 eventId로 재발행한다', async () => {
    store.findStalePublished.mockResolvedValue([submission]);

    await service.relay();

    const sent = producer.send.mock.calls[0][0] as {
      messages: Array<{ value: string }>;
    };
    const payload = JSON.parse(sent.messages[0].value) as { eventId: string };
    expect(payload.eventId).toBe('event-1');
  });

  it('발행 실패는 로그만 남기고 markPublished를 호출하지 않는다', async () => {
    store.findReceived.mockResolvedValue([submission]);
    producer.send.mockRejectedValue(new Error('broker unreachable'));

    await expect(service.relay()).resolves.toBeUndefined();
    expect(store.markPublished).not.toHaveBeenCalled();
  });

  it('한 건 발행 실패가 다른 건 처리를 막지 않는다', async () => {
    const other = {
      id: 'submission-2',
      surveyId: 'survey-1',
      expoId: 'expo-1',
      participationType: ParticipationType.TRAINEE,
      phoneNumber: '01012345678',
      eventId: 'event-2',
      status: SurveyAnswerSubmissionStatus.RECEIVED,
      payload: {
        answers: { '1': '좋았습니다' },
        personalInformationStatus: true,
      },
    } as unknown as SurveyAnswerSubmissionEntity;
    store.findReceived.mockResolvedValue([submission, other]);
    producer.send
      .mockRejectedValueOnce(new Error('broker unreachable'))
      .mockResolvedValueOnce(undefined);

    await service.relay();

    expect(store.markPublished).toHaveBeenCalledTimes(1);
    expect(store.markPublished).toHaveBeenCalledWith('submission-2', 1);
  });
  describe('이벤트 버전', () => {
    const publishedValue = () => {
      const sent = producer.send.mock.calls[0][0] as {
        messages: Array<{ value: string }>;
      };
      return JSON.parse(sent.messages[0].value) as {
        eventId: string;
        version: number;
        questions?: unknown;
      };
    };

    const serviceWithVersion = (version: unknown) => {
      config.get.mockImplementation((key: string, fallback: unknown) =>
        key === 'SURVEY_ANSWER_EVENT_VERSION' ? version : fallback,
      );

      return new SurveyAnswerRelayService(
        kafka as never,
        config as never,
        store as unknown as SurveyAnswerSubmissionStore,
      );
    };

    it('기본은 v1이고 스냅샷이 있어도 싣지 않는다', async () => {
      store.findReceived.mockResolvedValue([submissionWithSnapshot]);

      await service.relay();

      const value = publishedValue();
      expect(value.version).toBe(1);
      expect(value).not.toHaveProperty('questions');
    });

    it('v2로 설정하면 제출 당시의 문항 스냅샷을 싣는다', async () => {
      store.findReceived.mockResolvedValue([submissionWithSnapshot]);

      await serviceWithVersion('2').relay();

      const value = publishedValue();
      expect(value.version).toBe(2);
      expect(value.questions).toEqual(questions);
    });

    it('v2여도 스냅샷이 없는 옛 접수 건은 v1 그대로 재발행한다', async () => {
      store.findStalePublished.mockResolvedValue([submission]);

      await serviceWithVersion('2').relay();

      const value = publishedValue();
      expect(value.version).toBe(1);
      expect(value).not.toHaveProperty('questions');
    });

    it('처음 발행하면 정한 버전을 기록한다', async () => {
      store.findReceived.mockResolvedValue([submissionWithSnapshot]);

      await serviceWithVersion('2').relay();

      expect(store.markPublished).toHaveBeenCalledWith('submission-1', 2);
    });

    it('v1로 발행한 건은 설정이 v2로 바뀌어도 같은 v1로 재발행한다', async () => {
      store.findStalePublished.mockResolvedValue([
        {
          ...submissionWithSnapshot,
          status: SurveyAnswerSubmissionStatus.PUBLISHED,
          eventVersion: 1,
        },
      ]);

      await serviceWithVersion('2').relay();

      const value = publishedValue();
      expect(value.eventId).toBe('event-1');
      expect(value.version).toBe(1);
      expect(value).not.toHaveProperty('questions');
      expect(store.markPublished).toHaveBeenCalledWith('submission-1', 1);
    });

    it('v2로 발행한 건은 설정이 v1로 돌아가도 같은 v2로 재발행한다', async () => {
      store.findStalePublished.mockResolvedValue([
        {
          ...submissionWithSnapshot,
          status: SurveyAnswerSubmissionStatus.PUBLISHED,
          eventVersion: 2,
        },
      ]);

      await service.relay();

      const value = publishedValue();
      expect(value.eventId).toBe('event-1');
      expect(value.version).toBe(2);
      expect(value.questions).toEqual(questions);
      expect(store.markPublished).toHaveBeenCalledWith('submission-1', 2);
    });

    it('버전을 기록하기 전에 이미 발행된 건은 설정이 v2여도 v1로 재발행한다', async () => {
      store.findStalePublished.mockResolvedValue([
        {
          ...submissionWithSnapshot,
          status: SurveyAnswerSubmissionStatus.PUBLISHED,
          eventVersion: null,
        },
      ]);

      await serviceWithVersion('2').relay();

      expect(publishedValue().version).toBe(1);
    });

    it.each(['0', '3', 'abc'])(
      '지원하지 않는 버전(%s)은 기동 때 거부한다',
      (version) => {
        expect(() => serviceWithVersion(version)).toThrow(
          'SURVEY_ANSWER_EVENT_VERSION must be 1 or 2.',
        );
      },
    );
  });
});
