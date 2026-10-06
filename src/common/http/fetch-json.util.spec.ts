import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { z } from 'zod';
import { ExternalServiceError } from './external-service.error.js';
import { postJson } from './fetch-json.util.js';

/** 바디 취소 여부를 확인할 수 있는 응답. */
function trackedResponse(status: number) {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const response = new Response('{"message":"x"}', { status });
  Object.defineProperty(response, 'body', { value: { cancel } });
  return { response, cancel };
}

describe('postJson', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('404는 null을 돌려주고, 읽지 않는 바디를 버려 연결을 돌려준다', async () => {
    const { response, cancel } = trackedResponse(404);
    fetchMock.mockResolvedValue(response);

    await expect(postJson('http://x/y', {}, z.object({}))).resolves.toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it('그 외 비정상 응답은 바디를 버리고 ExternalServiceError를 던진다', async () => {
    const { response, cancel } = trackedResponse(500);
    fetchMock.mockResolvedValue(response);

    await expect(postJson('http://x/y', {}, z.object({}))).rejects.toThrow(
      ExternalServiceError,
    );
    expect(cancel).toHaveBeenCalled();
  });
});
