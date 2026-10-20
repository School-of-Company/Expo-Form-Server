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
      kafka,
      config,
      submissionStore as unknown as SurveyAnswerSubmissionStore,
    );
    await consumer.onModuleInit();
  });

  it('STORED 이벤트는 사유 없이 markFinal(STORED)로 넘긴다', async () => {
    await eachMessage({
      message: toMessage({ eventId: 'event-1', status: 'STORED', reason: 'x' }),
    });

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
    });

    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      'event-1',
      SurveyAnswerSubmissionStatus.REJECTED,
      '이미 신청 마감',
    );
  });

  it('알 수 없는 상태는 무시한다', async () => {
    await eachMessage({
      message: toMessage({ eventId: 'event-1', status: 'UNKNOWN' }),
    });

    expect(submissionStore.markFinal).not.toHaveBeenCalled();
  });

  it.each(['{', 'null', '[]', '"text"', '{"status":"STORED"}', '{"eventId":1,"status":"STORED"}'])(
    '해석할 수 없는 메시지(%s)는 던지지 않고 건너뛴다',
    async (raw) => {
      await expect(
        eachMessage({
          topic: 't',
          partition: 0,
          message: { value: Buffer.from(raw), offset: '1' } as KafkaMessage,
        }),
      ).resolves.toBeUndefined();

      expect(submissionStore.markFinal).not.toHaveBeenCalled();
    },
  );

  it('깨진 메시지 뒤의 정상 결과는 반영한다', async () => {
    await eachMessage({
      topic: 't',
      partition: 0,
      message: { value: Buffer.from('{'), offset: '1' } as KafkaMessage,
    });
    await eachMessage({
      message: toMessage({ eventId: 'event-2', status: 'STORED' }),
    });

    expect(submissionStore.markFinal).toHaveBeenCalledTimes(1);
    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      'event-2',
      SurveyAnswerSubmissionStatus.STORED,
      null,
    );
  });

  it('markFinal의 일시 장애는 삼키지 않고 던져 재시도되게 한다', async () => {
    submissionStore.markFinal.mockRejectedValue(new Error('db down'));

    await expect(
      eachMessage({
        message: toMessage({ eventId: 'event-1', status: 'STORED' }),
      }),
    ).rejects.toThrow('db down');
  });

  it('value가 없는 메시지는 무시한다', async () => {
    await eachMessage({
      message: { value: null } as KafkaMessage,
    });

    expect(submissionStore.markFinal).not.toHaveBeenCalled();
  });
});
