import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { classifyFailure } from './downstream-observer.js';
import { ExternalServiceError } from './external-service.error.js';
import { deleteRequest, fetchJson, putJson } from './fetch-json.util.js';
import {
  BrokenCircuitError,
  guardDownstream,
  isTransientFailure,
  resetDownstreamGuards,
} from './resilience.js';

const schema = z.object({ ok: z.boolean() });
const expo = { service: 'expo', operation: 'exists' } as const;
const user = { service: 'user', operation: 'find' } as const;

const jsonResponse = (status: number, body?: unknown) =>
  Response.json(body ?? { ok: true }, { status });

describe('하위 서비스 회로 차단기', () => {
  beforeEach(() => {
    vi.stubEnv('DOWNSTREAM_BREAKER_FAILURE_THRESHOLD', '3');
    vi.stubEnv('DOWNSTREAM_BREAKER_HALF_OPEN_MS', '60000');
    resetDownstreamGuards();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetDownstreamGuards();
  });

  it('5xx·연결 실패·타임아웃만 서비스 장애로 센다', () => {
    expect(isTransientFailure(new ExternalServiceError('u', 503))).toBe(true);
    expect(isTransientFailure(new TypeError('fetch failed'))).toBe(true);
    expect(
      isTransientFailure(new DOMException('timeout', 'TimeoutError')),
    ).toBe(true);
    expect(isTransientFailure(new ExternalServiceError('u', 409))).toBe(false);
    expect(isTransientFailure(new ExternalServiceError('u', 401))).toBe(false);
    expect(isTransientFailure(new z.ZodError([]))).toBe(false);
  });

  it('연속 실패가 한도를 넘으면 회로가 열려 호출하지 않는다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500));
    vi.stubGlobal('fetch', fetchMock);

    // GET은 즉시 실패를 1회 재시도하므로 호출 2번이 시도 2번이다. 한도 3 = 호출 2번(시도 4번 중 3번째에서 열림).
    await expect(
      fetchJson('http://x/1', schema, { observe: expo }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(
      fetchJson('http://x/2', schema, { observe: expo }),
    ).rejects.toBeInstanceOf(Error);
    const calls = fetchMock.mock.calls.length;

    await expect(
      fetchJson('http://x/3', schema, { observe: expo }),
    ).rejects.toBeInstanceOf(BrokenCircuitError);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('서비스마다 회로가 따로다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        jsonResponse(url.includes('expo') ? 500 : 200),
      ),
    );

    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      await fetchJson('http://expo/x', schema, { observe: expo }).catch(
        () => undefined,
      );
    }

    await expect(
      fetchJson('http://expo/x', schema, { observe: expo }),
    ).rejects.toBeInstanceOf(BrokenCircuitError);
    await expect(
      fetchJson('http://user/x', schema, { observe: user }),
    ).resolves.toEqual({ ok: true });
  });

  it('404·409 같은 정상 거절은 회로에 반영하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { code: 'X' })),
    );

    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await putJson('http://x/1', {}, schema, { observe: expo }).catch(
        () => undefined,
      );
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200)),
    );
    await expect(
      putJson('http://x/1', {}, schema, { observe: expo }),
    ).resolves.toEqual({ ok: true });
  });

  it('GET은 즉시 실패를 한 번 재시도하고, 쓰기는 재시도하지 않는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValue(jsonResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchJson('http://x/1', schema, { observe: expo }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const writeMock = vi.fn(async () => jsonResponse(503));
    vi.stubGlobal('fetch', writeMock);
    await expect(
      deleteRequest('http://x/1', { observe: user }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('타임아웃은 재시도하지 않는다', async () => {
    const call = vi.fn(async () => {
      throw new DOMException('timeout', 'TimeoutError');
    });

    await expect(guardDownstream('expo', true, call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('회로가 열린 호출은 circuit_open으로 분류한다', () => {
    expect(classifyFailure(new BrokenCircuitError())).toBe('circuit_open');
  });

  it('잘못된 환경변수는 오류로 알린다', async () => {
    vi.stubEnv('DOWNSTREAM_BREAKER_FAILURE_THRESHOLD', '0');
    resetDownstreamGuards();

    await expect(guardDownstream('expo', false, async () => 1)).rejects.toThrow(
      'DOWNSTREAM_BREAKER_FAILURE_THRESHOLD',
    );
  });
});
