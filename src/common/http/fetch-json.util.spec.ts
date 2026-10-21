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
import {
  createTraceContext,
  formatTraceparent,
  runWithTrace,
} from '../../tracing/trace-context.js';
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

  it('401은 바디의 code를 ExternalServiceError에 싣는다(JSON이 아니면 없음)', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 'SESSION_EXPIRED' }, { status: 401 }),
    );
    await expect(
      postJson('http://x/y', {}, z.object({})),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    await expect(
      postJson('http://x/y', {}, z.object({})),
    ).rejects.toMatchObject({ status: 401, code: undefined });
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

describe('traceparent 전파', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('요청 처리 중이면 traceparent를 싣고, 호출자가 준 헤더를 덮어쓰지 않는다', async () => {
    const context = createTraceContext();

    await runWithTrace(context, async () => {
      await fetchJson('http://x/y', z.object({ ok: z.boolean() }), {
        headers: { 'X-Internal-Token': 'secret' },
      });
      await postJson('http://x/y', {}, z.object({ ok: z.boolean() }));
    });

    for (const [, init] of fetchMock.mock.calls as Array<
      [string, { headers: Record<string, string> }]
    >) {
      expect(init.headers.traceparent).toBe(formatTraceparent(context));
    }

    expect(
      (
        fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
      )[1].headers['X-Internal-Token'],
    ).toBe('secret');
  });

  it('요청 밖에서는 traceparent를 붙이지 않는다', async () => {
    await fetchJson('http://x/y', z.object({ ok: z.boolean() }));

    expect(
      (
        fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
      )[1].headers,
    ).not.toHaveProperty('traceparent');
  });
});
