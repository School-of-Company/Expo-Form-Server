import process from 'node:process';
import {
  BrokenCircuitError,
  circuitBreaker,
  SamplingBreaker,
  ConstantBackoff,
  handleWhen,
  retry,
  type CircuitBreakerPolicy,
  type IPolicy,
} from 'cockatiel';
import { ExternalServiceError } from './external-service.error.js';

export { BrokenCircuitError } from 'cockatiel';

const DEFAULT_MIN_CALLS = 10;
const DEFAULT_FAILURE_RATE_PERCENT = 50;
const DEFAULT_WINDOW_MS = 30_000;
const DEFAULT_HALF_OPEN_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 200;

/**
 * 하위 서비스가 아파서 생긴 실패인지. 타임아웃·연결 실패(`fetch`의 `TypeError`)·5xx만 센다.
 * 404·409·401 같은 응답과 스키마 불일치는 서비스가 살아 있다는 증거라 회로에 반영하지 않는다.
 */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof ExternalServiceError) {
    return error.status >= 500;
  }

  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError'))
  );
}

/** 타임아웃은 이미 한도만큼 기다린 뒤라 다시 시도하면 응답 시간만 두 배가 된다. 곧바로 실패한 것만 재시도한다. */
function isRetryable(error: unknown): boolean {
  return (
    isTransientFailure(error) &&
    !(
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    )
  );
}

function readInteger(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be an integer of at least ${min}.`);
  }

  return value;
}

/**
 * 최근 `WINDOW_MS` 동안 호출이 `MIN_CALLS`번 이상이고 실패율이 `FAILURE_RATE` 퍼센트를 넘으면 연다. 호출이 적을 때
 * 몇 번의 실패로 열리지 않게 하려는 것이다 — 재시도가 요청마다 실패를 두 번 세므로 "연속 N회"는 너무 쉽게 열렸다.
 */
function createSamplingBreaker(): SamplingBreaker {
  const windowMs = readInteger(
    'DOWNSTREAM_BREAKER_WINDOW_MS',
    DEFAULT_WINDOW_MS,
    1000,
  );
  const minCalls = readInteger(
    'DOWNSTREAM_BREAKER_MIN_CALLS',
    DEFAULT_MIN_CALLS,
    1,
  );
  const ratePercent = readInteger(
    'DOWNSTREAM_BREAKER_FAILURE_RATE',
    DEFAULT_FAILURE_RATE_PERCENT,
    1,
  );
  if (ratePercent > 99) {
    throw new Error('DOWNSTREAM_BREAKER_FAILURE_RATE must be at most 99.');
  }

  return new SamplingBreaker({
    threshold: ratePercent / 100,
    duration: windowMs,
    minimumRps: minCalls / (windowMs / 1000),
  });
}

type ServiceGuard = {
  breaker: CircuitBreakerPolicy;
  retryPolicy: IPolicy;
};

const guards = new Map<string, ServiceGuard>();

/** 서비스별로 회로를 따로 둔다 — 박람회 서비스가 죽어도 유저 서비스 호출은 막지 않는다. */
function guardFor(service: string): ServiceGuard {
  let guard = guards.get(service);
  if (guard === undefined) {
    const breaker = circuitBreaker(handleWhen(isTransientFailure), {
      halfOpenAfter: readInteger(
        'DOWNSTREAM_BREAKER_HALF_OPEN_MS',
        DEFAULT_HALF_OPEN_MS,
        1,
      ),
      breaker: createSamplingBreaker(),
    });
    const retryPolicy = retry(handleWhen(isRetryable), {
      maxAttempts: readInteger(
        'DOWNSTREAM_RETRY_ATTEMPTS',
        DEFAULT_RETRY_ATTEMPTS,
        0,
      ),
      backoff: new ConstantBackoff(RETRY_DELAY_MS),
    });
    guard = { breaker, retryPolicy };
    guards.set(service, guard);
  }

  return guard;
}

/**
 * 하위 서비스 호출을 회로 차단기로 감싼다. 실패율이 한도를 넘으면 회로가 열려 한동안 호출하지 않고
 * {@link BrokenCircuitError}로 바로 실패한다 — 죽은 서비스를 기다리며 요청이 쌓이는 것을 막는다.
 *
 * `idempotent`일 때만 재시도한다(멱등한 GET). 쓰기는 응답을 못 받았어도 상대가 처리했을 수 있어 재시도하지 않는다.
 * 재시도는 회로 바깥에서 돌므로 시도마다 실패로 세고, 회로가 열리면 재시도하지 않는다.
 */
export async function guardDownstream<T>(
  service: string,
  idempotent: boolean,
  call: () => Promise<T>,
): Promise<T> {
  const { breaker, retryPolicy } = guardFor(service);
  const guarded = async () => breaker.execute(call);

  return idempotent ? retryPolicy.execute(guarded) : guarded();
}

/** 테스트에서 회로 상태와 환경변수 설정을 처음으로 되돌린다. */
export function resetDownstreamGuards(): void {
  guards.clear();
}

/**
 * 하위 서비스 호출 실패를 남긴다. 회로가 열려 호출하지 않은 경우는 장애 동안 요청마다 반복되므로 스택 없이 한 줄
 * 경고로만 남기고, 그 밖의 실패는 원인과 함께 오류로 남긴다.
 */
export function logDownstreamFailure(
  logger: {
    warn(message: string): void;
    error(message: string, error: unknown): void;
  },
  message: string,
  error: unknown,
): void {
  if (error instanceof BrokenCircuitError) {
    logger.warn(`${message} (회로 열림, 호출하지 않음)`);
    return;
  }

  logger.error(message, error);
}
