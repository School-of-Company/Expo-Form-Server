/** 외부 서비스 호출이 2xx/404가 아닌 응답으로 실패했을 때 던진다. */
export class ExternalServiceError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    /** 401·409 응답 바디의 `code`(예: 유저 서비스의 `SESSION_EXPIRED`). 없거나 읽지 못하면 undefined. */
    public readonly code?: string,
  ) {
    super(`외부 서비스 호출 실패: ${url} (status: ${status})`);
    this.name = 'ExternalServiceError';
  }
}

/** `AbortSignal.timeout`이 만든 타임아웃인지. fetch는 `TimeoutError`(DOMException)로 거절한다. */
export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
