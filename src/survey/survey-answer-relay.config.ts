/** 릴레이 주기·배치·재발행 간격 설정. 기본값은 환경변수를 설정하지 않았을 때의 기존 동작이다. */
export type SurveyAnswerRelaySettings = {
  /** 릴레이를 도는 주기(ms). */
  intervalMs: number;
  /** 한 주기에 RECEIVED / 재발행 대상을 각각 최대 몇 건 잠글지. */
  batchSize: number;
  /** Kafka `sendBatch` 한 번에 묶을 최대 건수. */
  sendBatchSize: number;
  /** 첫 재발행까지의 대기(ms). 이후 `backoffFactor`배씩 늘어난다. */
  staleMs: number;
  /** 재발행 간격 상한(ms). */
  staleMaxMs: number;
  /** 간격에 더할 지터의 최대 비율(0~1). 0이면 지터 없음. */
  jitterRatio: number;
  /** 재발행 상한 횟수. */
  maxRetryCount: number;
};

export const DEFAULT_RELAY_SETTINGS: SurveyAnswerRelaySettings = {
  intervalMs: 30_000,
  batchSize: 100,
  sendBatchSize: 50,
  staleMs: 5 * 60 * 1000,
  staleMaxMs: 30 * 60 * 1000,
  jitterRatio: 0.2,
  maxRetryCount: 5,
};

/** 재발행 간격이 늘어나는 배수. */
export const BACKOFF_FACTOR = 2;

const ENV_KEYS = {
  intervalMs: 'SURVEY_ANSWER_RELAY_INTERVAL_MS',
  batchSize: 'SURVEY_ANSWER_RELAY_BATCH_SIZE',
  sendBatchSize: 'SURVEY_ANSWER_RELAY_SEND_BATCH_SIZE',
  staleMs: 'SURVEY_ANSWER_STALE_MS',
  staleMaxMs: 'SURVEY_ANSWER_STALE_MAX_MS',
  jitterRatio: 'SURVEY_ANSWER_STALE_JITTER_RATIO',
  maxRetryCount: 'SURVEY_ANSWER_MAX_RETRY_COUNT',
} as const;

/**
 * 환경변수에서 릴레이 설정을 읽는다. 비어 있으면 기본값을 쓰고, 값이 잘못되면 기동 때 거부한다
 * (잘못된 값으로 조용히 폭주하거나 멈추는 것보다 낫다).
 */
export function resolveRelaySettings(
  get: (key: string) => unknown,
): SurveyAnswerRelaySettings {
  const read = (
    name: keyof SurveyAnswerRelaySettings,
    valid: (value: number) => boolean,
    rule: string,
  ): number => {
    const key = ENV_KEYS[name];
    const raw = get(key);
    if ([undefined, null, ''].includes(raw as string | null | undefined)) {
      return DEFAULT_RELAY_SETTINGS[name];
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || !valid(value)) {
      throw new Error(`${key} must be ${rule}.`);
    }

    return value;
  };

  const positiveInt = (value: number) => Number.isSafeInteger(value) && value > 0;

  const settings = {
    intervalMs: read('intervalMs', positiveInt, 'a positive integer'),
    batchSize: read('batchSize', positiveInt, 'a positive integer'),
    sendBatchSize: read('sendBatchSize', positiveInt, 'a positive integer'),
    staleMs: read('staleMs', positiveInt, 'a positive integer'),
    staleMaxMs: read('staleMaxMs', positiveInt, 'a positive integer'),
    jitterRatio: read(
      'jitterRatio',
      (value) => value >= 0 && value <= 1,
      'between 0 and 1',
    ),
    maxRetryCount: read('maxRetryCount', positiveInt, 'a positive integer'),
  };

  // 상한이 기본 간격보다 작으면 간격이 줄어드는 셈이라 기본 간격을 하한으로 둔다.
  return { ...settings, staleMaxMs: Math.max(settings.staleMaxMs, settings.staleMs) };
}

/**
 * `retryCount`번째 발행 뒤 다음 재발행까지의 기본 대기(ms). 지터는 더하지 않는다.
 * 릴레이가 발행할 때마다(claim) `retryCount`를 올리므로 첫 재발행 대기는 `retryCount = 1`이고 `staleMs`와 같다.
 */
export function backoffDelayMs(
  retryCount: number,
  settings: Pick<SurveyAnswerRelaySettings, 'staleMs' | 'staleMaxMs'>,
): number {
  const exponent = Math.max(retryCount - 1, 0);
  return Math.min(
    settings.staleMs * (BACKOFF_FACTOR ** exponent),
    settings.staleMaxMs,
  );
}

/** 배열을 `size` 건씩 나눈다. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
