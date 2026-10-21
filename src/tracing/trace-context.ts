import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

/** 한 요청(또는 한 번의 스케줄 작업)을 따라다니는 W3C Trace Context 값. */
export interface TraceContext {
  traceId: string;
  /** 이 서비스가 맡은 구간의 span id. 하위 호출에는 이 값이 부모로 전달된다. */
  spanId: string;
  sampled: boolean;
}

const TRACEPARENT_PATTERN =
  /^00-(?<traceId>[0-9a-f]{32})-(?<spanId>[0-9a-f]{16})-(?<flags>[0-9a-f]{2})$/u;
const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);

const storage = new AsyncLocalStorage<TraceContext>();

/** 들어온 `traceparent` 헤더를 해석한다. 형식이 틀리거나 값이 전부 0이면 `undefined`. */
export function parseTraceparent(
  header: string | undefined,
): { traceId: string; parentSpanId: string; sampled: boolean } | undefined {
  const match = TRACEPARENT_PATTERN.exec(header?.trim().toLowerCase() ?? '');
  const { traceId, spanId, flags } = match?.groups ?? {};
  if (
    traceId === undefined ||
    spanId === undefined ||
    flags === undefined ||
    traceId === ZERO_TRACE_ID ||
    spanId === ZERO_SPAN_ID
  ) {
    return undefined;
  }

  // 플래그의 최하위 비트가 sampled다(16진 두 자리라 끝 숫자의 홀짝으로 판단한다).
  return {
    traceId,
    parentSpanId: spanId,
    sampled: Number.parseInt(flags.slice(-1), 16) % 2 === 1,
  };
}

/** 헤더가 유효하면 같은 trace에 이어 붙고, 아니면 새 trace를 시작한다. 이 서비스의 span id는 항상 새로 만든다. */
export function createTraceContext(traceparent?: string): TraceContext {
  const parsed = parseTraceparent(traceparent);
  return {
    traceId: parsed?.traceId ?? randomBytes(16).toString('hex'),
    spanId: randomBytes(8).toString('hex'),
    sampled: parsed?.sampled ?? true,
  };
}

export function formatTraceparent({
  traceId,
  spanId,
  sampled,
}: TraceContext): string {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

export function runWithTrace<T>(context: TraceContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentTrace(): TraceContext | undefined {
  return storage.getStore();
}
