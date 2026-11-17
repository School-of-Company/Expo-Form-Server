/**
 * 발행 실패를 몇 번까지 다시 시도할지의 기본값(`SURVEY_DRAW_RESULT_MAX_RETRY_COUNT`). 10초 주기라 100번이면 약 17분이다 —
 * Kafka가 잠깐 끊겼다고 당첨 문자를 포기하지 않을 만큼 길고, 계속 실패하는 건이 영원히 배치를 차지하지 않을 만큼 짧다.
 */
export const DEFAULT_DRAW_MAX_RETRY_COUNT = 100;

const MAX_RETRY_COUNT_KEY = 'SURVEY_DRAW_RESULT_MAX_RETRY_COUNT';

/**
 * 당첨 결과 릴레이의 재시도 상한을 읽는다. 비어 있으면 기본값을 쓰고, 값이 잘못되면 거부한다
 * (환경변수는 문자열로 들어오므로 숫자로 바꿔 검증한다 — 답변 릴레이의 `resolveRelaySettings`와 같은 규칙).
 */
export function resolveDrawMaxRetryCount(get: (key: string) => unknown): number {
  const raw = get(MAX_RETRY_COUNT_KEY);
  if ([undefined, null, ''].includes(raw as string | null | undefined)) {
    return DEFAULT_DRAW_MAX_RETRY_COUNT;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${MAX_RETRY_COUNT_KEY} must be a positive integer.`);
  }

  return value;
}
