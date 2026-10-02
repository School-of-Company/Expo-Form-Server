import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { EachMessageHandler, KafkaMessage } from 'kafkajs';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerResultConsumer } from './survey-answer-result.consumer.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyStore } from './survey.store.js';

function toMessage(payload: unknown): KafkaMessage {
  return { value: Buffer.from(JSON.stringify(payload)) } as KafkaMessage;
}

describe('SurveyAnswerResultConsumer', () => {
  let consumerClient: {
    connect: Mock;
    subscribe: Mock;
    run: Mock;
    disconnect: Mock;
  };
  let kafka: { consumer: Mock };
  let config: { get: Mock; getOrThrow: Mock };
  let submissionStore: {
    markFinal: Mock;
    findByEventId: Mock;
  };
  let surveyStore: { decrementTotalAnswers: Mock };
  let eachMessage: EachMessageHandler;

  beforeEach(async () => {
    consumerClient = {
      connect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn((options: { eachMessage: EachMessageHandler }) => {
        eachMessage = options.eachMessage;
      }),
      disconnect: vi.fn(),
    };
    kafka = { consumer: vi.fn().mockReturnValue(consumerClient) };
    config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
      getOrThrow: vi.fn().mockReturnValue('survey.answer.result'),
    };
    submissionStore = { markFinal: vi.fn(), findByEventId: vi.fn() };
    surveyStore = { decrementTotalAnswers: vi.fn() };

    const consumer = new SurveyAnswerResultConsumer(
      kafka as never,
      config as never,
      submissionStore as unknown as SurveyAnswerSubmissionStore,
      surveyStore as unknown as SurveyStore,
    );
    await consumer.onModuleInit();
  });

  it('STORED 이벤트는 markFinal(STORED)만 호출하고 응답 수는 건드리지 않는다', async () => {
    await eachMessage({
      message: toMessage({ eventId: 'event-1', status: 'STORED' }),
    } as never);

    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      'event-1',
      SurveyAnswerSubmissionStatus.STORED,
      null,
    );
    expect(surveyStore.decrementTotalAnswers).not.toHaveBeenCalled();
  });

  it('REJECTED 이벤트를 실제로 반영했으면 누적 응답 수를 되돌린다', async () => {
    submissionStore.markFinal.mockResolvedValue(true);
    submissionStore.findByEventId.mockResolvedValue({ surveyId: 'survey-1' });

    await eachMessage({
      message: toMessage({
        eventId: 'event-1',
        status: 'REJECTED',
        reason: '이미 신청 마감',
      }),
    } as never);

    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      'event-1',
      SurveyAnswerSubmissionStatus.REJECTED,
      '이미 신청 마감',
    );
    expect(surveyStore.decrementTotalAnswers).toHaveBeenCalledWith('survey-1');
  });

  it('이미 종결된 row라 markFinal이 false면 응답 수를 되돌리지 않는다(늦게 도착한 중복 이벤트)', async () => {
    submissionStore.markFinal.mockResolvedValue(false);

    await eachMessage({
      message: toMessage({ eventId: 'event-1', status: 'REJECTED' }),
    } as never);

    expect(submissionStore.findByEventId).not.toHaveBeenCalled();
    expect(surveyStore.decrementTotalAnswers).not.toHaveBeenCalled();
  });

  it('알 수 없는 상태는 무시한다', async () => {
    await eachMessage({
      message: toMessage({ eventId: 'event-1', status: 'UNKNOWN' }),
    } as never);

    expect(submissionStore.markFinal).not.toHaveBeenCalled();
  });

  it('value가 없는 메시지는 무시한다', async () => {
    await eachMessage({
      message: { value: null } as KafkaMessage,
    } as never);

    expect(submissionStore.markFinal).not.toHaveBeenCalled();
  });
});
