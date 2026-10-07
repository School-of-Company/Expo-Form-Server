import type { z } from 'zod';
import { ExternalServiceError } from './external-service.error.js';

const DEFAULT_TIMEOUT_MS = 3000;

/** {@link fetchJson}·{@link postJson} 호출 옵션. */
export type JsonRequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

/**
 * 외부 서비스에 GET 요청을 보내고 JSON으로 파싱한다.
 * 응답 모양은 `schema`로 실제 검증한다 — 외부 서비스도 경계이므로 캐스팅으로 믿지 않는다.
 * 404는 "없음"으로 보고 null을 반환하고, 그 외 실패는 {@link ExternalServiceError}를 던진다.
 */
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }: JsonRequestOptions = {},
): Promise<T | null> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  return parseJsonResponse(url, response, schema);
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
  { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }: JsonRequestOptions = {},
): Promise<T | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  return parseJsonResponse(url, response, schema);
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

  if (!response.ok) {
    await discardBody(response);
    throw new ExternalServiceError(url, response.status);
  }

  return schema.parse(await response.json());
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
