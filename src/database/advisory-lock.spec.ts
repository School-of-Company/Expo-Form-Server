import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_LOCK_HOLD_MS, runExclusive } from './advisory-lock.js';

function fakeDataSource(locked: boolean) {
  const query = vi.fn(async (sql: string) =>
    sql.includes('pg_try_advisory_lock') ? [{ locked }] : [],
  );
  const release = vi.fn(async () => undefined);
  return {
    dataSource: { createQueryRunner: () => ({ query, release }) } as never,
    query,
    release,
  };
}

describe('runExclusive', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('잠금을 못 잡으면 실행하지 않고 연결을 돌려준다', async () => {
    const { dataSource, query, release } = fakeDataSource(false);
    const run = vi.fn();

    await expect(runExclusive(dataSource, 'job', run)).resolves.toEqual({
      skipped: true,
    });
    expect(run).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('작업이 일찍 끝나도 최소 유지 시간이 지난 뒤에 잠금을 푼다', async () => {
    vi.useFakeTimers();
    const { dataSource, query, release } = fakeDataSource(true);

    const outcome = runExclusive(dataSource, 'job', async () => 'done');
    // 작업이 끝나고 대기 타이머가 걸릴 때까지 마이크로태스크를 먼저 흘린다.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MIN_LOCK_HOLD_MS - 1);
    expect(query).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toEqual({ skipped: false, result: 'done' });
    expect(query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock(1, hashtext($1))',
      ['job'],
    );
    expect(release).toHaveBeenCalledTimes(1);
  });
});
