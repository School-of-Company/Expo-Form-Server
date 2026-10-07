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
import { fetchJson, postJson } from './fetch-json.util.js';

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

describe('fetchJson', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('요청 헤더를 그대로 싣고 응답을 스키마로 검증해 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      fetchJson('http://x/y', z.object({ ok: z.boolean() }), {
        headers: { 'X-Internal-Token': 'secret' },
      }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/y');
    expect(init.headers).toEqual({ 'X-Internal-Token': 'secret' });
  });

  it('404는 null을 돌려주고, 그 외 비정상 응답은 ExternalServiceError를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(fetchJson('http://x/y', z.object({}))).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(fetchJson('http://x/y', z.object({}))).rejects.toThrow(
      ExternalServiceError,
    );
  });
});
