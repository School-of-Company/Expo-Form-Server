import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  chunk,
  DEFAULT_RELAY_SETTINGS,
  resolveRelaySettings,
} from './survey-answer-relay.config.js';

const minute = 60_000;

describe('resolveRelaySettings', () => {
  it('환경변수가 없으면 기존 동작과 같은 기본값을 쓴다', () => {
    const settings = resolveRelaySettings(() => undefined);

    expect(settings).toEqual(DEFAULT_RELAY_SETTINGS);
    expect(settings.intervalMs).toBe(30_000);
    expect(settings.batchSize).toBe(100);
    expect(settings.staleMs).toBe(5 * minute);
    expect(settings.maxRetryCount).toBe(5);
  });

  it('빈 문자열은 설정하지 않은 것으로 본다', () => {
    expect(resolveRelaySettings(() => '')).toEqual(DEFAULT_RELAY_SETTINGS);
  });

  it('문자열 환경변수를 숫자로 읽는다', () => {
    const env = new Map([
      ['SURVEY_ANSWER_RELAY_INTERVAL_MS', '10000'],
      ['SURVEY_ANSWER_RELAY_BATCH_SIZE', '200'],
      ['SURVEY_ANSWER_RELAY_SEND_BATCH_SIZE', '20'],
      ['SURVEY_ANSWER_STALE_JITTER_RATIO', '0.5'],
    ]);

    const settings = resolveRelaySettings((key) => env.get(key));

    expect(settings).toMatchObject({
      intervalMs: 10_000,
      batchSize: 200,
      sendBatchSize: 20,
      jitterRatio: 0.5,
    });
  });

  it.each([
    ['SURVEY_ANSWER_RELAY_INTERVAL_MS', '0'],
    ['SURVEY_ANSWER_RELAY_BATCH_SIZE', '-1'],
    ['SURVEY_ANSWER_RELAY_SEND_BATCH_SIZE', '1.5'],
    ['SURVEY_ANSWER_STALE_MS', 'abc'],
    ['SURVEY_ANSWER_STALE_JITTER_RATIO', '2'],
  ])('%s=%s 같은 잘못된 값은 거부한다', (key, value) => {
    expect(() => resolveRelaySettings((k) => (k === key ? value : undefined))).toThrow(
      `${key} must be`,
    );
  });

  it('간격 상한이 기본 간격보다 작으면 기본 간격으로 올린다', () => {
    const settings = resolveRelaySettings((key) =>
      key === 'SURVEY_ANSWER_STALE_MAX_MS' ? '1000' : undefined,
    );

    expect(settings.staleMaxMs).toBe(settings.staleMs);
  });
});

describe('backoffDelayMs', () => {
  const settings = { staleMs: 5 * minute, staleMaxMs: 30 * minute };

  it('첫 재발행은 기존 간격과 같고 이후 두 배씩 늘어난다', () => {
    expect([1, 2, 3].map((count) => backoffDelayMs(count, settings))).toEqual([
      5 * minute,
      10 * minute,
      20 * minute,
    ]);
  });

  it('상한에서 멈춘다', () => {
    expect(backoffDelayMs(4, settings)).toBe(30 * minute);
    expect(backoffDelayMs(20, settings)).toBe(30 * minute);
  });

  it('retryCount 0은 기본 간격으로 본다', () => {
    expect(backoffDelayMs(0, settings)).toBe(5 * minute);
  });
});

describe('chunk', () => {
  it('크기별로 나누고 마지막 묶음은 남는 만큼만 담는다', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('빈 배열은 묶음이 없다', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('크기보다 적으면 한 묶음이다', () => {
    expect(chunk([1, 2], 50)).toEqual([[1, 2]]);
  });
});
