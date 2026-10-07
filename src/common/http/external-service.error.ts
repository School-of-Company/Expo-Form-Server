/** 외부 서비스 호출이 2xx/404가 아닌 응답으로 실패했을 때 던진다. */
export class ExternalServiceError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`외부 서비스 호출 실패: ${url} (status: ${status})`);
    this.name = 'ExternalServiceError';
  }
}
