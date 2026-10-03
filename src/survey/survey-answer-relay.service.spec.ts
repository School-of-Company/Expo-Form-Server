import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
    expect(store.markPublished).toHaveBeenCalledWith('submission-1');
  });

  it('오래 머문 PUBLISHED 건도 같은 eventId로 재발행한다', async () => {
    store.findStalePublished.mockResolvedValue([submission]);

    await service.relay();

    const sent = producer.send.mock.calls[0][0] as {
      messages: { value: string }[];
    };
    expect(JSON.parse(sent.messages[0].value).eventId).toBe('event-1');
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
    expect(store.markPublished).toHaveBeenCalledWith('submission-2');
  });
});
