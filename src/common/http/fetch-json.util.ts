import type { z } from 'zod';
import { ExternalServiceError } from './external-service.error.js';

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * 외부 서비스에 GET 요청을 보내고 JSON으로 파싱한다.
 * 응답 모양은 `schema`로 실제 검증한다 — 외부 서비스도 경계이므로 캐스팅으로 믿지 않는다.
 * 404는 "없음"으로 보고 null을 반환하고, 그 외 실패는 {@link ExternalServiceError}를 던진다.
 */
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

  if (response.status === 404) return null;
  if (!response.ok) throw new ExternalServiceError(url, response.status);

  return schema.parse(await response.json());
}
