import process from 'node:process';
import { ExternalServiceError } from './external-service.error.js';

/** 외부 서비스 호출 결과 분류. 지표 라벨로 쓰므로 값은 이 목록으로 고정한다. */
export type DownstreamOutcome =
  'success' | 'not_found' | 'conflict' | 'timeout' | 'failure';

/** 호출을 어느 서비스의 어떤 작업으로 셀지. 둘 다 코드에서 정한 고정 이름이다(URL·ID·번호를 넣지 않는다). */
export type DownstreamLabels = {
  service: 'expo' | 'user';
  operation: string;
};

export type DownstreamSample = DownstreamLabels & {
  outcome: DownstreamOutcome;
  seconds: number;
};

type DownstreamObserver = (sample: DownstreamSample) => void;

let observer: DownstreamObserver | undefined;

/** 호출 결과를 받을 곳을 정한다. 메트릭이 꺼져 있으면 `undefined`로 두어 계측을 건너뛴다. */
export function setDownstreamObserver(
  next: DownstreamObserver | undefined,
): void {
  observer = next;
}

/** `AbortSignal.timeout`이 만든 타임아웃인지. fetch는 `TimeoutError`(DOMException)로 거절한다. */
function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

export function classifyFailure(error: unknown): DownstreamOutcome {
  if (isTimeout(error)) {
    return 'timeout';
  }

  return error instanceof ExternalServiceError && error.status === 409
    ? 'conflict'
    : 'failure';
}

/**
 * `call`의 소요 시간과 결과를 기록한다. 결과가 `null`이면 404(없음)로 센다 — 호출 유틸이 404를 `null`로 돌려준다.
 * 계측이 실패해도 호출 결과에 영향을 주지 않는다(관측은 부가 기능이다).
 */
export async function observeDownstream<T>(
  labels: DownstreamLabels | undefined,
  call: () => Promise<T>,
): Promise<T> {
  if (labels === undefined || observer === undefined) {
    return call();
  }

  const startedAt = process.hrtime.bigint();
  const record = (outcome: DownstreamOutcome) => {
    try {
      observer?.({
        ...labels,
        outcome,
        seconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
      });
    } catch {
      // 계측 오류는 삼킨다.
    }
  };

  try {
    const result = await call();
    record(result === null ? 'not_found' : 'success');
    return result;
  } catch (error) {
    record(classifyFailure(error));
    throw error;
  }
}
