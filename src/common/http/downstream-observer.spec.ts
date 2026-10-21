import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  classifyFailure,
  observeDownstream,
  setDownstreamObserver,
  type DownstreamSample,
} from './downstream-observer.js';
import { ExternalServiceError } from './external-service.error.js';
import { fetchJson, putJson } from './fetch-json.util.js';

const labels = { service: 'expo', operation: 'exists' } as const;

describe('downstream observer', () => {
  afterEach(() => {
    setDownstreamObserver(undefined);
    vi.unstubAllGlobals();
  });

  const collect = () => {
    const samples: DownstreamSample[] = [];
    setDownstreamObserver((sample) => {
      samples.push(sample);
    });
    return samples;
  };

  it('성공·null(404)·실패를 결과로 분류하고 시간을 잰다', async () => {
    const samples = collect();

    await observeDownstream(labels, async () => 'ok');
    await observeDownstream(labels, async () => null);
    await expect(
      observeDownstream(labels, async () => {
        throw new ExternalServiceError('http://x', 500);
      }),
    ).rejects.toThrow();

    expect(samples.map((sample) => sample.outcome)).toEqual([
      'success',
      'not_found',
      'failure',
    ]);
    expect(samples.every((sample) => sample.seconds >= 0)).toBe(true);
    expect(samples[0]).toMatchObject(labels);
  });

  it.each([
    ['409는 conflict', new ExternalServiceError('http://x', 409), 'conflict'],
    ['5xx는 failure', new ExternalServiceError('http://x', 503), 'failure'],
    [
      '타임아웃은 timeout',
      new DOMException('timed out', 'TimeoutError'),
      'timeout',
    ],
    ['그 밖의 오류는 failure', new TypeError('fetch failed'), 'failure'],
  ])('%s', (_label, error, outcome) => {
    expect(classifyFailure(error)).toBe(outcome);
  });

  it('라벨이 없으면 계측하지 않고 결과만 돌려준다', async () => {
    const samples = collect();

    await expect(observeDownstream(undefined, async () => 7)).resolves.toBe(7);
    expect(samples).toEqual([]);
  });

  it('계측이 던져도 호출 결과를 바꾸지 않는다', async () => {
    setDownstreamObserver(() => {
      throw new Error('observer broke');
    });

    await expect(observeDownstream(labels, async () => 'ok')).resolves.toBe(
      'ok',
    );
  });

  it('observe 옵션이 있는 fetchJson·putJson이 응답 코드별로 기록한다', async () => {
    const samples = collect();
    const respond = (status: number, body: unknown = {}) =>
      vi.fn().mockResolvedValue(Response.json(body, { status }));
    const schema = z.looseObject({});

    vi.stubGlobal('fetch', respond(200));
    await fetchJson('http://x/a', schema, { observe: labels });
    vi.stubGlobal('fetch', respond(404));
    await fetchJson('http://x/a', schema, { observe: labels });
    vi.stubGlobal('fetch', respond(409));
    await expect(
      putJson('http://x/a', {}, schema, { observe: labels }),
    ).rejects.toThrow();
    vi.stubGlobal('fetch', respond(500));
    await expect(
      fetchJson('http://x/a', schema, { observe: labels }),
    ).rejects.toThrow();

    expect(samples.map((sample) => sample.outcome)).toEqual([
      'success',
      'not_found',
      'conflict',
      'failure',
    ]);
  });

  it('observe 옵션이 없으면 기록하지 않는다', async () => {
    const samples = collect();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    );

    await fetchJson('http://x/a', z.looseObject({}));

    expect(samples).toEqual([]);
  });
});
