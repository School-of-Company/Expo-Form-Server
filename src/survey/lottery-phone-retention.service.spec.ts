import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import {
  DEFAULT_LOTTERY_PHONE_RETENTION_DAYS,
  isRetentionExpired,
  LotteryPhoneRetentionService,
} from './lottery-phone-retention.service.js';
import type { SurveyDrawResultStore } from './survey-draw-result.store.js';

describe('isRetentionExpired', () => {
  it('종료일로부터 보관 일수가 지난 다음 날부터 만료다', () => {
    // 10월 31일 종료, 30일 보관 → 11월 30일까지 보관, 12월 1일부터 만료
    expect(isRetentionExpired('2026-10-31', '2026-11-30', 30)).toBe(false);
    expect(isRetentionExpired('2026-10-31', '2026-12-01', 30)).toBe(true);
  });

  it('종료일 당일과 박람회 진행 중에는 만료가 아니다', () => {
    expect(isRetentionExpired('2026-10-31', '2026-10-31', 30)).toBe(false);
    expect(isRetentionExpired('2026-10-31', '2026-10-01', 30)).toBe(false);
  });

  it('윤년·월 경계를 날짜 그대로 계산한다', () => {
    expect(isRetentionExpired('2028-02-28', '2028-03-29', 30)).toBe(false);
    expect(isRetentionExpired('2028-02-28', '2028-03-30', 30)).toBe(true);
  });

  it.each(['', '2026/10/31', '20261031', '2026-10-3', 'abc'])(
    '날짜를 읽을 수 없으면(%s) 지우지 않는다',
    (finishedDay) => {
      expect(isRetentionExpired(finishedDay, '2030-01-01', 30)).toBe(false);
      expect(isRetentionExpired('2026-10-31', finishedDay, 30)).toBe(false);
    },
  );
});

describe('LotteryPhoneRetentionService', () => {
  const expoA = '11111111-1111-1111-1111-111111111111';
  const expoB = '22222222-2222-2222-2222-222222222222';
  // 2026-12-15 한국 시간 낮
  const now = new Date('2026-12-15T03:00:00Z');

  let store: { findExpoIdsWithPhoneNumbers: Mock; clearPhoneNumbers: Mock };
  let expoClient: { exists: Mock; findPeriod: Mock };
  let configValue: string | undefined;
  let service: LotteryPhoneRetentionService;

  beforeEach(() => {
    configValue = undefined;
    store = {
      findExpoIdsWithPhoneNumbers: vi.fn().mockResolvedValue([]),
      clearPhoneNumbers: vi.fn().mockResolvedValue(0),
    };
    expoClient = { exists: vi.fn(), findPeriod: vi.fn() };
    const config = {
      get: vi.fn(() => configValue),
    } as unknown as ConfigService;
    service = new LotteryPhoneRetentionService(
      config,
      store as unknown as SurveyDrawResultStore,
      expoClient,
    );
  });

  const period = (finishedDay: string) => ({
    startedDay: '2026-10-01',
    finishedDay,
  });

  it('번호가 남은 박람회가 없으면 박람회 서비스를 부르지 않는다', async () => {
    const summary = await service.purgeExpired(now);

    expect(summary).toEqual({
      checkedExpos: 0,
      purgedExpos: 0,
      clearedPhoneNumbers: 0,
      skippedExpos: 0,
    });
    expect(expoClient.findPeriod).not.toHaveBeenCalled();
  });

  it('종료 후 보관 기간(기본 30일)이 지난 박람회의 번호만 지운다', async () => {
    store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoA, expoB]);
    // 12월 15일 기준: A는 10월 31일 종료(45일 경과), B는 12월 1일 종료(14일 경과)
    expoClient.findPeriod.mockImplementation(async (id: string) =>
      period(id === expoA ? '2026-10-31' : '2026-12-01'),
    );
    store.clearPhoneNumbers.mockResolvedValue(3);

    const summary = await service.purgeExpired(now);

    expect(store.clearPhoneNumbers).toHaveBeenCalledTimes(1);
    expect(store.clearPhoneNumbers).toHaveBeenCalledWith(expoA);
    expect(summary).toMatchObject({
      checkedExpos: 2,
      purgedExpos: 1,
      clearedPhoneNumbers: 3,
      skippedExpos: 0,
    });
  });

  it('보관 일수를 설정으로 바꿀 수 있다', async () => {
    configValue = '7';
    store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoB]);
    expoClient.findPeriod.mockResolvedValue(period('2026-12-01'));
    store.clearPhoneNumbers.mockResolvedValue(1);

    await service.purgeExpired(now);

    expect(store.clearPhoneNumbers).toHaveBeenCalledWith(expoB);
  });

  it.each(['0', '-3', '1.5', 'abc'])(
    '보관 일수 설정이 올바르지 않으면(%s) 기본 %i일을 쓴다',
    async (value) => {
      configValue = value;
      store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoB]);
      // 종료 14일 경과: 기본 30일이면 지우지 않아야 한다
      expoClient.findPeriod.mockResolvedValue(period('2026-12-01'));

      await service.purgeExpired(now);

      expect(DEFAULT_LOTTERY_PHONE_RETENTION_DAYS).toBe(30);
      expect(store.clearPhoneNumbers).not.toHaveBeenCalled();
    },
  );

  it('박람회가 이미 없으면(404) 번호를 지운다', async () => {
    store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoA]);
    expoClient.findPeriod.mockResolvedValue(null);
    store.clearPhoneNumbers.mockResolvedValue(2);

    const summary = await service.purgeExpired(now);

    expect(store.clearPhoneNumbers).toHaveBeenCalledWith(expoA);
    expect(summary.clearedPhoneNumbers).toBe(2);
  });

  it('박람회 서비스에 확인하지 못하면 지우지 않고 건너뛴다', async () => {
    store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoA]);
    expoClient.findPeriod.mockRejectedValue(
      new ExternalServiceUnavailableException(),
    );

    const summary = await service.purgeExpired(now);

    expect(store.clearPhoneNumbers).not.toHaveBeenCalled();
    expect(summary.skippedExpos).toBe(1);
  });

  it('한 박람회가 실패해도 나머지 박람회는 계속 처리한다', async () => {
    store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoA, expoB]);
    expoClient.findPeriod.mockImplementation(async (id: string) => {
      if (id === expoA) {
        throw new Error('boom');
      }

      return period('2026-10-31');
    });
    store.clearPhoneNumbers.mockResolvedValue(1);

    const summary = await service.purgeExpired(now);

    expect(store.clearPhoneNumbers).toHaveBeenCalledTimes(1);
    expect(store.clearPhoneNumbers).toHaveBeenCalledWith(expoB);
    expect(summary).toEqual({
      checkedExpos: 2,
      purgedExpos: 1,
      clearedPhoneNumbers: 1,
      skippedExpos: 1,
    });
  });

  it('이전 정리가 아직 돌고 있으면 겹쳐 돌지 않는다', async () => {
    let release: () => void = () => undefined;
    store.findExpoIdsWithPhoneNumbers.mockReturnValue(
      new Promise<string[]>((resolve) => {
        release = () => {
          resolve([]);
        };
      }),
    );

    const first = service.purgeExpired(now);
    const second = await service.purgeExpired(now);
    release();
    await first;

    expect(second.checkedExpos).toBe(0);
    expect(store.findExpoIdsWithPhoneNumbers).toHaveBeenCalledTimes(1);
  });

  it('한국 시간 기준 날짜로 만료를 판단한다', async () => {
    // UTC 12월 1일 15:30은 한국 시간 12월 2일 00:30 → 종료 11월 1일 + 30일 = 12월 1일까지 보관, 12월 2일부터 만료
    store.findExpoIdsWithPhoneNumbers.mockResolvedValue([expoA]);
    expoClient.findPeriod.mockResolvedValue(period('2026-11-01'));
    store.clearPhoneNumbers.mockResolvedValue(1);

    await service.purgeExpired(new Date('2026-12-01T15:30:00Z'));
    expect(store.clearPhoneNumbers).toHaveBeenCalledTimes(1);

    store.clearPhoneNumbers.mockClear();
    await service.purgeExpired(new Date('2026-12-01T14:30:00Z'));
    expect(store.clearPhoneNumbers).not.toHaveBeenCalled();
  });
});
