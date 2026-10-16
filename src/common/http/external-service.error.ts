/** 외부 서비스 호출이 2xx/404가 아닌 응답으로 실패했을 때 던진다. */
export class ExternalServiceError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    /** 401 응답 바디의 `code`(예: 유저 서비스의 `SESSION_EXPIRED`). 없거나 읽지 못하면 undefined. */
    public readonly code?: string,
  ) {
    super(`외부 서비스 호출 실패: ${url} (status: ${status})`);
    this.name = 'ExternalServiceError';
  }
}
