import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DicoshotService } from 'dicoshot-nest';
import type { Kafka } from 'kafkajs';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyDrawResultRelayService } from './survey-draw-result-relay.service.js';
import {
  SurveyDrawResultStore,
  type DrawRelayFailure,
} from './survey-draw-result.store.js';

const result = (id: string, drawNumber: number) =>
  ({
    id,
    eventId: `event-${id}`,
    surveyId: 'survey-1',
    survey: { id: 'survey-1', expoId: 'expo-1' },
    drawNumber,
    phoneNumber: '01012345678',
    publishedAt: null,
    retryCount: 0,
  }) as unknown as SurveyDrawResultEntity;

describe('SurveyDrawResultRelayService', () => {
  let producer: { connect: Mock; disconnect: Mock; send: Mock };
  let store: { relayUnpublished: Mock };
  let dicoshot: { sendCustom: Mock };
  let configValues: Map<string, unknown>;
  let service: SurveyDrawResultRelayService;

  /** store가 하는 일(잠그고 건마다 publish를 부른다)만 흉내 낸다. 실제 잠금은 integration 테스트가 본다. */
  const storeRunning =
    (results: SurveyDrawResultEntity[]) =>
    async (
      _limit: number,
      _max: number,
      publish: (r: SurveyDrawResultEntity) => Promise<void>,
    ): Promise<DrawRelayFailure[]> => {
      const failures: DrawRelayFailure[] = [];
      for (const item of results) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await publish(item);
        } catch (error) {
          failures.push({ result: item, error, retryCount: 1 });
        }
      }

      return failures;
    };

  beforeEach(() => {
    producer = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };
    store = {
      relayUnpublished: vi.fn(storeRunning([result('a', 30)])),
    };
    dicoshot = { sendCustom: vi.fn().mockResolvedValue(true) };
    configValues = new Map();
    const config = {
      get: vi.fn((key: string, fallback: unknown) =>
        configValues.has(key) ? configValues.get(key) : fallback,
      ),
    };
    service = new SurveyDrawResultRelayService(
      { producer: () => producer } as unknown as Kafka,
      config as unknown as ConfigService,
      store as unknown as SurveyDrawResultStore,
      dicoshot as unknown as DicoshotService,
    );
  });

  it('당첨 결과를 알림 서비스 계약대로 발행한다', async () => {
    await service.relay();

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'notification.sms.requested',
      messages: [
        {
          key: 'survey-1',
          value: JSON.stringify({
            type: 'DRAW_RESULT',
            eventId: 'event-a',
            version: 1,
            phoneNumber: '01012345678',
            drawNumber: 30,
            expoId: 'expo-1',
          }),
        },
      ],
    });
  });

  it('발행할 결과가 없으면 아무것도 보내지 않는다', async () => {
    store.relayUnpublished.mockImplementation(storeRunning([]));

    await service.relay();

    expect(producer.send).not.toHaveBeenCalled();
  });

  it('한 건이 실패해도 다음 건을 계속 발행한다', async () => {
    store.relayUnpublished.mockImplementation(
      storeRunning([result('a', 30), result('b', 62)]),
    );
    producer.send
      .mockRejectedValueOnce(new Error('broker unreachable'))
      .mockResolvedValueOnce(undefined);

    await service.relay();

    expect(producer.send).toHaveBeenCalledTimes(2);
  });

  it('재시도 상한 기본값 100을 store에 넘기고, 설정으로 바꿀 수 있다', async () => {
    await service.relay();
    expect(store.relayUnpublished).toHaveBeenLastCalledWith(
      100,
      100,
      expect.any(Function),
    );

    configValues.set('SURVEY_DRAW_RESULT_MAX_RETRY_COUNT', 3);
    await service.relay();
    expect(store.relayUnpublished).toHaveBeenLastCalledWith(
      100,
      3,
      expect.any(Function),
    );
  });

  describe('재시도 상한', () => {
    const failure = (retryCount: number): DrawRelayFailure => ({
      result: result('a', 30),
      error: new Error('broker unreachable'),
      retryCount,
    });

    it('상한 전의 실패는 알리지 않는다', async () => {
      configValues.set('SURVEY_DRAW_RESULT_MAX_RETRY_COUNT', 3);
      store.relayUnpublished.mockResolvedValue([failure(2)]);

      await service.relay();

      expect(dicoshot.sendCustom).not.toHaveBeenCalled();
    });

    it('상한에 닿은 실패는 사람이 볼 수 있게 알리고, 전화번호는 싣지 않는다', async () => {
      configValues.set('SURVEY_DRAW_RESULT_MAX_RETRY_COUNT', 3);
      store.relayUnpublished.mockResolvedValue([failure(3)]);

      await service.relay();

      expect(dicoshot.sendCustom).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(dicoshot.sendCustom.mock.calls[0])).not.toContain(
        '01012345678',
      );
    });

    it('알림 전송이 실패해도 릴레이는 던지지 않는다', async () => {
      configValues.set('SURVEY_DRAW_RESULT_MAX_RETRY_COUNT', 1);
      store.relayUnpublished.mockResolvedValue([failure(1)]);
      dicoshot.sendCustom.mockRejectedValue(new Error('discord down'));

      await expect(service.relay()).resolves.toBeUndefined();
    });
  });

  it('이전 실행이 아직 돌고 있으면 겹쳐 돌지 않는다', async () => {
    let release: () => void = () => undefined;
    store.relayUnpublished.mockReturnValue(
      new Promise<DrawRelayFailure[]>((resolve) => {
        release = () => {
          resolve([]);
        };
      }),
    );

    const first = service.relay();
    await service.relay();
    release();
    await first;

    expect(store.relayUnpublished).toHaveBeenCalledTimes(1);
  });

  it('실행이 실패로 끝나도 다음 주기에는 다시 돈다', async () => {
    store.relayUnpublished.mockRejectedValueOnce(new Error('db down'));

    await expect(service.relay()).rejects.toThrow('db down');
    await service.relay();

    expect(store.relayUnpublished).toHaveBeenCalledTimes(2);
  });
});
