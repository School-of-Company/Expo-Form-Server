import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type {
  EachMessageHandler,
  EachMessagePayload,
  Kafka,
  KafkaMessage,
} from 'kafkajs';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerResultConsumer } from './survey-answer-result.consumer.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

const EVENT_ID = '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c';
const EVENT_ID_2 = '7a9d1c33-2b64-4f0a-8e15-0c4d9b7a2e61';

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
  // 테스트는 `message` 등 쓰는 필드만 채워 호출하므로 페이로드를 부분 타입으로 받는다.
  let eachMessage: (payload: Partial<EachMessagePayload>) => Promise<void>;

  beforeEach(async () => {
    consumerClient = {
      connect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn((options: { eachMessage: EachMessageHandler }) => {
        eachMessage = options.eachMessage as unknown as typeof eachMessage;
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
      kafka as unknown as Kafka,
      config as unknown as ConfigService,
      submissionStore as unknown as SurveyAnswerSubmissionStore,
    );
    await consumer.onModuleInit();
  });

  it('STORED 이벤트는 사유 없이 markFinal(STORED)로 넘긴다', async () => {
    await eachMessage({
      message: toMessage({ eventId: EVENT_ID, status: 'STORED', reason: 'x' }),
    });

    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      EVENT_ID,
      SurveyAnswerSubmissionStatus.STORED,
      null,
    );
  });

  it('REJECTED 이벤트는 사유와 함께 markFinal(REJECTED)로 넘긴다', async () => {
    await eachMessage({
      message: toMessage({
        eventId: EVENT_ID,
        status: 'REJECTED',
        reason: '이미 신청 마감',
      }),
    });

    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      EVENT_ID,
      SurveyAnswerSubmissionStatus.REJECTED,
      '이미 신청 마감',
    );
  });

  it('알 수 없는 상태는 무시한다', async () => {
    await eachMessage({
      message: toMessage({ eventId: EVENT_ID, status: 'UNKNOWN' }),
    });

    expect(submissionStore.markFinal).not.toHaveBeenCalled();
  });

  it.each([
    '{',
    'null',
    '[]',
    '"text"',
    '{"status":"STORED"}',
    '{"eventId":1,"status":"STORED"}',
    // `eventId` 컬럼이 uuid라 다른 모양이면 DB가 오류를 던지고, 재시도해도 같아서 컨슈머가 계속 막힌다.
    '{"eventId":"not-a-uuid","status":"STORED"}',
  ])('해석할 수 없는 메시지(%s)는 던지지 않고 건너뛴다', async (raw) => {
    await expect(
      eachMessage({
        topic: 't',
        partition: 0,
        message: { value: Buffer.from(raw), offset: '1' } as KafkaMessage,
      }),
    ).resolves.toBeUndefined();

    expect(submissionStore.markFinal).not.toHaveBeenCalled();
  });

  it('깨진 메시지 뒤의 정상 결과는 반영한다', async () => {
    await eachMessage({
      topic: 't',
      partition: 0,
      message: { value: Buffer.from('{'), offset: '1' } as KafkaMessage,
    });
    await eachMessage({
      message: toMessage({ eventId: EVENT_ID_2, status: 'STORED' }),
    });

    expect(submissionStore.markFinal).toHaveBeenCalledTimes(1);
    expect(submissionStore.markFinal).toHaveBeenCalledWith(
      EVENT_ID_2,
      SurveyAnswerSubmissionStatus.STORED,
      null,
    );
  });

  it('markFinal의 일시 장애는 삼키지 않고 던져 재시도되게 한다', async () => {
    submissionStore.markFinal.mockRejectedValue(new Error('db down'));

    await expect(
      eachMessage({
        message: toMessage({ eventId: EVENT_ID, status: 'STORED' }),
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
