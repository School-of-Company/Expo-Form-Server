import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { EachMessageHandler, KafkaMessage } from 'kafkajs';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerResultConsumer } from './survey-answer-result.consumer.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

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
  let submissionStore: { markFinal: Mock };
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
    submissionStore = { markFinal: vi.fn() };

    const consumer = new SurveyAnswerResultConsumer(
      kafka as never,
      config as never,
      submissionStore as unknown as SurveyAnswerSubmissionStore,
    );
    await consumer.onModuleInit();
  });

  it('STORED 이벤트는 사유 없이 markFinal(STORED)로 넘긴다', async () => {
    await eachMessage({
      message: toMessage({ eventId: 'event-1', status: 'STORED', reason: 'x' }),
    } as never);

    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      'event-1',
      SurveyAnswerSubmissionStatus.STORED,
      null,
    );
  });

  it('REJECTED 이벤트는 사유와 함께 markFinal(REJECTED)로 넘긴다', async () => {
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
