import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { classifyFailure } from './downstream-observer.js';
import { ExternalServiceError } from './external-service.error.js';
import { deleteRequest, fetchJson, putJson } from './fetch-json.util.js';
import {
  BrokenCircuitError,
  BulkheadRejectedError,
  guardDownstream,
  isTransientFailure,
  logDownstreamFailure,
  resetDownstreamGuards,
} from './resilience.js';

const schema = z.object({ ok: z.boolean() });
const expo = { service: 'expo', operation: 'exists' } as const;
const user = { service: 'user', operation: 'find' } as const;

const jsonResponse = (status: number, body?: unknown) =>
  Response.json(body ?? { ok: true }, { status });

describe('하위 서비스 회로 차단기', () => {
  beforeEach(() => {
    vi.stubEnv('DOWNSTREAM_BREAKER_MIN_CALLS', '3');
    vi.stubEnv('DOWNSTREAM_BREAKER_FAILURE_RATE', '50');
    vi.stubEnv('DOWNSTREAM_BREAKER_WINDOW_MS', '60000');
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

    // GET은 즉시 실패를 1회 재시도하므로 요청 하나가 시도 둘이다. 최소 3회이므로 두 번째 요청의 첫 시도에서 열린다.
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

  it('호출이 최소 횟수보다 적으면 모두 실패해도 열지 않는다', async () => {
    vi.stubEnv('DOWNSTREAM_BREAKER_MIN_CALLS', '10');
    resetDownstreamGuards();
    const call = vi.fn(async () => {
      throw new ExternalServiceError('http://x', 503);
    });

    for (let i = 0; i < 9; i++) {
      // eslint-disable-next-line no-await-in-loop
      await guardDownstream('expo', false, call).catch(() => undefined);
    }

    // 아홉 번째까지 모두 실패해도 열리지 않아 열 번째 호출도 실제로 나간다.
    await expect(guardDownstream('expo', false, call)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    expect(call).toHaveBeenCalledTimes(10);
    await expect(guardDownstream('expo', false, call)).rejects.toBeInstanceOf(
      BrokenCircuitError,
    );
  });

  it('실패율이 한도 이하면 열지 않는다', async () => {
    vi.stubEnv('DOWNSTREAM_BREAKER_MIN_CALLS', '4');
    resetDownstreamGuards();
    let n = 0;
    const call = async () => {
      n++;
      if (n % 3 === 0) {
        throw new ExternalServiceError('http://x', 503);
      }

      return n;
    };

    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      await guardDownstream('expo', false, call).catch(() => undefined);
    }

    await expect(
      guardDownstream('expo', false, async () => 'ok'),
    ).resolves.toBe('ok');
  });

  it('bypassGuard 호출은 회로가 열려 있어도 보낸다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(503));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      await fetchJson('http://x/1', schema, { observe: expo }).catch(
        () => undefined,
      );
    }

    await expect(
      fetchJson('http://x/1', schema, { observe: expo }),
    ).rejects.toBeInstanceOf(BrokenCircuitError);

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      deleteRequest('http://x/1', { observe: expo, bypassGuard: true }),
    ).resolves.toBeUndefined();
  });

  it('회로가 열려 호출하지 않은 실패는 스택 없이 경고 한 줄로 남긴다', () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    logDownstreamFailure(logger, '실패', new BrokenCircuitError());
    logDownstreamFailure(logger, '실패', new BulkheadRejectedError(1, 0));
    logDownstreamFailure(logger, '실패', new ExternalServiceError('u', 500));

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('잘못된 환경변수는 오류로 알린다', async () => {
    vi.stubEnv('DOWNSTREAM_BREAKER_MIN_CALLS', '0');
    resetDownstreamGuards();

    await expect(guardDownstream('expo', false, async () => 1)).rejects.toThrow(
      'DOWNSTREAM_BREAKER_MIN_CALLS',
    );
  });

  it('동시 호출 상한을 넘으면 대기열까지만 받고 나머지는 거절한다', async () => {
    vi.stubEnv('DOWNSTREAM_BULKHEAD_MAX_CONCURRENT', '2');
    vi.stubEnv('DOWNSTREAM_BULKHEAD_MAX_QUEUE', '1');
    resetDownstreamGuards();

    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const slow = async () => {
      await gate;
      return 'ok';
    };

    const running = [
      guardDownstream('expo', false, slow),
      guardDownstream('expo', false, slow),
      guardDownstream('expo', false, slow),
    ];
    await expect(guardDownstream('expo', false, slow)).rejects.toBeInstanceOf(
      BulkheadRejectedError,
    );
    expect(classifyFailure(new BulkheadRejectedError(2, 1))).toBe(
      'bulkhead_full',
    );

    // 다른 서비스는 영향을 받지 않는다.
    await expect(
      guardDownstream('user', false, async () => 'user'),
    ).resolves.toBe('user');

    open();
    await expect(Promise.all(running)).resolves.toEqual(['ok', 'ok', 'ok']);
  });

  it('거절된 호출은 회로 실패로 세지 않는다', async () => {
    vi.stubEnv('DOWNSTREAM_BULKHEAD_MAX_CONCURRENT', '1');
    vi.stubEnv('DOWNSTREAM_BULKHEAD_MAX_QUEUE', '0');
    resetDownstreamGuards();

    let finish!: () => void;
    const held = guardDownstream(
      'expo',
      false,
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await guardDownstream('expo', false, async () => 1).catch(
        () => undefined,
      );
    }

    finish();
    await held;
    await expect(
      guardDownstream('expo', false, async () => 'alive'),
    ).resolves.toBe('alive');
  });
});
