import { Buffer } from 'node:buffer';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type {
  EachMessageHandler,
  EachMessagePayload,
  Kafka,
  KafkaMessage,
} from 'kafkajs';
import {
  APPLY_MAX_ATTEMPTS,
  ExpoChangedConsumer,
} from './expo-changed.consumer.js';
import type { ExpoProjectionStore } from './expo-projection.store.js';

const EXPO_ID = '0192f0c8-0000-4000-8000-000000000001';
const EVENT_ID = '6f1c3a0e-8a43-4d4e-9a55-0d6f3e1b2c11';

function changed(version: number) {
  return {
    schemaVersion: 1,
    eventId: EVENT_ID,
    version,
    occurredAt: '2030-01-01T00:00:00Z',
    expoId: EXPO_ID,
    deleted: false,
    expo: { startedDay: '2030-01-01', finishedDay: '2030-01-02' },
  };
}

function toMessage(payload: unknown): KafkaMessage {
  return {
    key: Buffer.from(EXPO_ID),
    value: Buffer.from(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ),
    offset: '42',
    headers: {},
  } as unknown as KafkaMessage;
}

describe('ExpoChangedConsumer', () => {
  let consumerClient: {
    connect: Mock;
    subscribe: Mock;
    run: Mock;
    disconnect: Mock;
  };
  let producer: { connect: Mock; send: Mock; disconnect: Mock };
  let kafka: { consumer: Mock; producer: Mock };
  let store: { apply: Mock };
  let eachMessage: (payload: Partial<EachMessagePayload>) => Promise<void>;

  async function deliver(payload: unknown): Promise<void> {
    await eachMessage({
      topic: 'expo.expo.changed',
      partition: 3,
      message: toMessage(payload),
    });
  }

  beforeEach(async () => {
    consumerClient = {
      connect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn((options: { eachMessage: EachMessageHandler }) => {
        eachMessage = options.eachMessage as unknown as typeof eachMessage;
      }),
      disconnect: vi.fn(),
    };
    producer = { connect: vi.fn(), send: vi.fn(), disconnect: vi.fn() };
    kafka = {
      consumer: vi.fn().mockReturnValue(consumerClient),
      producer: vi.fn().mockReturnValue(producer),
    };
    store = { apply: vi.fn().mockResolvedValue('applied') };
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    };

    const consumer = new ExpoChangedConsumer(
      kafka as unknown as Kafka,
      config as unknown as ConfigService,
      store as unknown as ExpoProjectionStore,
    );
    await consumer.onModuleInit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('기본 토픽과 기존 그룹 이름 규칙으로 구독한다', () => {
    expect(kafka.consumer).toHaveBeenCalledWith({
      groupId: 'expo-form-server.expo-changed',
    });
    expect(consumerClient.subscribe).toHaveBeenCalledWith({
      topic: 'expo.expo.changed',
      fromBeginning: true,
    });
  });

  it('변경 이벤트를 박람회 기간과 버전으로 반영한다', async () => {
    await deliver(changed(7));

    expect(store.apply).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      version: 7,
      expoId: EXPO_ID,
      deleted: false,
      period: { startedDay: '2030-01-01', finishedDay: '2030-01-02' },
    });
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('tombstone은 삭제 이벤트로 반영한다', async () => {
    await deliver({ ...changed(8), expo: undefined, deleted: true });

    expect(store.apply).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      version: 8,
      expoId: EXPO_ID,
      deleted: true,
    });
  });

  it('이미 반영한 버전(중복·늦은 도착)이면 오류 없이 넘어간다', async () => {
    store.apply.mockResolvedValue('stale');

    await expect(deliver(changed(7))).resolves.toBeUndefined();
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('해석할 수 없는 메시지는 반영하지 않고 원래 키·값과 위치를 실어 DLT로 보낸다', async () => {
    await deliver('not-json');

    expect(store.apply).not.toHaveBeenCalled();
    expect(producer.send).toHaveBeenCalledTimes(1);
    const [record] = producer.send.mock.calls[0] as [
      {
        topic: string;
        messages: Array<{
          key: Buffer;
          value: Buffer;
          headers: Record<string, string>;
        }>;
      },
    ];
    expect(record.topic).toBe('expo.expo.changed.dlt');
    expect(record.messages[0].key.toString()).toBe(EXPO_ID);
    expect(record.messages[0].value.toString()).toBe('not-json');
    expect(record.messages[0].headers).toMatchObject({
      'kafka_dlt-original-topic': 'expo.expo.changed',
      'kafka_dlt-original-partition': '3',
      'kafka_dlt-original-offset': '42',
    });
  });

  it('반영이 잠깐 실패하면 다시 시도하고, 성공하면 DLT로 보내지 않는다', async () => {
    vi.useFakeTimers();
    store.apply
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce('applied');

    const delivered = deliver(changed(7));
    await vi.runAllTimersAsync();
    await delivered;

    expect(store.apply).toHaveBeenCalledTimes(2);
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('반영이 끝내 실패하면 DLT로 보내고 오프셋을 넘긴다', async () => {
    vi.useFakeTimers();
    store.apply.mockRejectedValue(new Error('db down'));

    const delivered = deliver(changed(7));
    await vi.runAllTimersAsync();
    await expect(delivered).resolves.toBeUndefined();

    expect(store.apply).toHaveBeenCalledTimes(APPLY_MAX_ATTEMPTS);
    expect(producer.send).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'expo.expo.changed.dlt' }),
    );
  });

  it('DLT 전송까지 실패하면 던져서 오프셋을 커밋하지 않는다', async () => {
    producer.send.mockRejectedValue(new Error('broker down'));

    await expect(deliver('not-json')).rejects.toThrow('broker down');
  });
});
