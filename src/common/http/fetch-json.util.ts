import type { z } from 'zod';
import {
  currentTrace,
  formatTraceparent,
} from '../../tracing/trace-context.js';
import {
  observeDownstream,
  type DownstreamLabels,
} from './downstream-observer.js';
import { ExternalServiceError } from './external-service.error.js';
import { guardDownstream } from './resilience.js';

const DEFAULT_TIMEOUT_MS = 3000;

/** 요청 처리 중이면 `traceparent`를 실어 하위 서비스가 같은 trace에 이어 붙게 한다. 호출자가 준 헤더가 우선한다. */
function withTrace(headers: Record<string, string>): Record<string, string> {
  const trace = currentTrace();
  return trace === undefined
    ? headers
    : { traceparent: formatTraceparent(trace), ...headers };
}

/**
 * 계측하고 회로 차단기로 감싼다. 호출 이름(`observe`)이 있어야 어느 서비스의 회로인지 알 수 있어 그때만 감싼다.
 * GET만 재시도한다 — 자세한 규칙은 {@link guardDownstream}.
 */
async function callDownstream<T>(
  { observe, bypassGuard }: JsonRequestOptions,
  idempotent: boolean,
  call: () => Promise<T>,
): Promise<T> {
  return observeDownstream(observe, async () =>
    observe === undefined || bypassGuard === true
      ? call()
      : guardDownstream(observe.service, idempotent, call),
  );
}

/** {@link fetchJson}·{@link postJson} 호출 옵션. */
export type JsonRequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** 지표에 남길 호출 이름. 없으면 계측하지 않는다. */
  observe?: DownstreamLabels;
  /**
   * 회로 차단기를 거치지 않고 계측만 한다. 예약 해제처럼 열린 회로 때문에 막히면 뒷정리가 안 되는 호출에 쓴다.
   */
  bypassGuard?: boolean;
};

/**
 * 외부 서비스에 GET 요청을 보내고 JSON으로 파싱한다.
 * 응답 모양은 `schema`로 실제 검증한다 — 외부 서비스도 경계이므로 캐스팅으로 믿지 않는다.
 * 404는 "없음"으로 보고 null을 반환하고, 그 외 실패는 {@link ExternalServiceError}를 던진다.
 */
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    observe,
    bypassGuard,
  }: JsonRequestOptions = {},
): Promise<T | null> {
  return callDownstream({ observe, bypassGuard }, true, async () => {
    const response = await fetch(url, {
      headers: withTrace(headers),
      signal: AbortSignal.timeout(timeoutMs),
    });

    return parseJsonResponse(url, response, schema);
  });
}

/**
 * 외부 서비스에 JSON 바디로 POST 요청을 보내고 응답을 파싱한다. 응답 처리 규칙은
 * {@link fetchJson}과 같다(404는 없음, 그 외 비정상 응답은 {@link ExternalServiceError}).
 *
 * 전화번호처럼 URL·접근 로그에 남으면 안 되는 값을 바디로 보낼 때 쓴다.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: JsonRequestOptions = {},
): Promise<T | null> {
  return sendJson(url, { method: 'POST', body }, schema, options);
}

/** 외부 서비스에 JSON 바디로 PUT 요청을 보내고 응답을 파싱한다. 응답 처리 규칙은 {@link fetchJson}과 같다. */
export async function putJson<T>(
  url: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: JsonRequestOptions = {},
): Promise<T | null> {
  return sendJson(url, { method: 'PUT', body }, schema, options);
}

/** 외부 서비스에 DELETE 요청을 보낸다. 응답 바디는 읽지 않고, 2xx가 아니면 {@link ExternalServiceError}를 던진다. */
export async function deleteRequest(
  url: string,
  {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    observe,
    bypassGuard,
  }: JsonRequestOptions = {},
): Promise<void> {
  return callDownstream({ observe, bypassGuard }, false, async () => {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: withTrace(headers),
      signal: AbortSignal.timeout(timeoutMs),
    });
    await discardBody(response);

    if (!response.ok) {
      throw new ExternalServiceError(url, response.status);
    }
  });
}

async function sendJson<T>(
  url: string,
  { method, body }: { method: 'POST' | 'PUT'; body: unknown },
  schema: z.ZodType<T>,
  {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    observe,
    bypassGuard,
  }: JsonRequestOptions,
): Promise<T | null> {
  return callDownstream({ observe, bypassGuard }, false, async () => {
    const response = await fetch(url, {
      method,
      headers: withTrace({ 'Content-Type': 'application/json', ...headers }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    return parseJsonResponse(url, response, schema);
  });
}

async function parseJsonResponse<T>(
  url: string,
  response: Response,
  schema: z.ZodType<T>,
): Promise<T | null> {
  if (response.status === 404) {
    await discardBody(response);
    return null;
  }

  // 401(세션 없음·만료 등)과 409(거절 사유)는 바디의 `code`로 이유를 구분하는 API가 있어 읽어서 넘긴다.
  if (response.status === 401 || response.status === 409) {
    throw new ExternalServiceError(
      url,
      response.status,
      await readErrorCode(response),
    );
  }

  if (!response.ok) {
    await discardBody(response);
    throw new ExternalServiceError(url, response.status);
  }

  return schema.parse(await response.json());
}

/** 오류 바디의 `code` 문자열을 읽는다. JSON이 아니거나 없으면 undefined — 바디는 어느 쪽이든 다 읽힌다. */
async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    const code = (body as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 읽지 않을 응답 바디를 버린다. Node의 `fetch`(undici)는 바디를 끝까지 읽거나 취소해야 연결을
 * 풀에 돌려준다 — 404·오류 응답을 그냥 두면 연결이 반환되지 않고 쌓인다.
 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 이미 닫힌 스트림이면 버릴 것이 없다.
  }
}
