import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Kafka } from 'kafkajs';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyDrawResultRelayService } from './survey-draw-result-relay.service.js';
import { SurveyDrawResultStore } from './survey-draw-result.store.js';

const result = (id: string, drawNumber: number) =>
  ({
    id,
    eventId: `event-${id}`,
    surveyId: 'survey-1',
    drawNumber,
    phoneNumber: '01012345678',
    publishedAt: null,
  }) as unknown as SurveyDrawResultEntity;

describe('SurveyDrawResultRelayService', () => {
  let producer: { connect: Mock; disconnect: Mock; send: Mock };
  let store: { findUnpublished: Mock; markPublished: Mock };
  let service: SurveyDrawResultRelayService;

  beforeEach(() => {
    producer = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };
    store = {
      findUnpublished: vi.fn().mockResolvedValue([result('a', 30)]),
      markPublished: vi.fn(),
    };
    const config = {
      get: vi.fn((_key: string, fallback: string) => fallback),
    };
    service = new SurveyDrawResultRelayService(
      { producer: () => producer } as unknown as Kafka,
      config as unknown as ConfigService,
      store as unknown as SurveyDrawResultStore,
    );
  });

  it('당첨 결과를 알림 서비스 계약대로 발행하고 발행했다고 표시한다', async () => {
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
          }),
        },
      ],
    });
    expect(store.markPublished).toHaveBeenCalledWith('a');
  });

  it('발행할 결과가 없으면 아무것도 보내지 않는다', async () => {
    store.findUnpublished.mockResolvedValue([]);

    await service.relay();

    expect(producer.send).not.toHaveBeenCalled();
  });

  it('한 건이 실패해도 표시하지 않고 다음 건을 계속 발행한다', async () => {
    store.findUnpublished.mockResolvedValue([result('a', 30), result('b', 62)]);
    producer.send
      .mockRejectedValueOnce(new Error('broker unreachable'))
      .mockResolvedValueOnce(undefined);

    await service.relay();

    expect(store.markPublished).toHaveBeenCalledTimes(1);
    expect(store.markPublished).toHaveBeenCalledWith('b');
  });
});
