import process from 'node:process';
import type { ConfigService } from '@nestjs/config';
import { Registry } from 'prom-client';
import type { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runtime from './metrics-runtime.js';
import { MetricsCollectorsService } from './metrics-collectors.service.js';

/** 쿼리를 받으면 유휴 연결이 있어도 다음 틱까지 대기열에 두는 `pg-pool`의 동작을 흉내 낸다. */
function fakePool() {
  const pool = { totalCount: 1, idleCount: 1, waitingCount: 0 };
  const query = vi.fn(async () => {
    pool.waitingCount += 1;
    await new Promise((resolve) => {
      // pg-pool이 쓰는 것과 같은 큐라야 실제 동작과 같다.
      process.nextTick(resolve);
    });
    pool.waitingCount -= 1;
    return [
      {
        received: 0,
        published: 0,
        exhausted: 0,
        unpublished: 0,
        oldest: null,
      },
    ];
  });
  const dataSource = {
    driver: { master: pool },
    query,
  } as unknown as DataSource;
  return { dataSource, query };
}

describe('MetricsCollectorsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('같은 스크레이프의 집계 쿼리가 연결을 기다리는 것을 풀 대기로 세지 않는다', async () => {
    const registry = new Registry();
    vi.spyOn(runtime, 'getMetricsRuntime').mockReturnValue({
      service: { registry },
    } as unknown as ReturnType<typeof runtime.getMetricsRuntime>);
    const { dataSource, query } = fakePool();
    const config = {
      get: (_key: string, fallback?: unknown) => fallback,
    } as unknown as ConfigService;

    new MetricsCollectorsService(dataSource, config).onModuleInit();
    const text = await registry.metrics();

    expect(query).toHaveBeenCalled();
    expect(text).toContain('form_db_pool_connections{state="waiting"} 0');
    expect(text).toContain('form_db_pool_connections{state="idle"} 1');
  });
});
