import { describe, expect, it, vi } from 'vitest';
import {
  GIFT_PIN_LOCK_SECONDS,
  GIFT_PIN_MAX_FAILED_ATTEMPTS,
  SurveyGiftStore,
} from './survey-gift.store.js';

function setup(claim: Record<string, unknown> | null, hasPin = true) {
  const manager = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FOR UPDATE')) {
        return claim ? [claim] : [];
      }

      // 완료 직후 시각을 다시 읽는 SELECT
      return sql.startsWith('SELECT')
        ? [{ claimedAt: new Date('2026-10-27T01:00:00Z') }]
        : [];
    }),
    findOneBy: vi.fn().mockResolvedValue(hasPin ? { pinHash: 'hash' } : null),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };

  return { manager, store: new SurveyGiftStore(dataSource as never) };
}

const open = {
  id: 'c',
  claimedAt: null,
  failedAttempts: 0,
  lockRemaining: 0,
};
const writes = (manager: ReturnType<typeof setup>['manager']) =>
  manager.query.mock.calls.filter(([sql]) => !sql.startsWith('SELECT'));

describe('SurveyGiftStore.confirm', () => {
  it('토큰이 없으면 NOT_FOUND이고 아무것도 쓰지 않는다', async () => {
    const { manager, store } = setup(null);

    await expect(store.confirm('s', 'h', async () => true)).resolves.toEqual({
      status: 'NOT_FOUND',
    });
    expect(writes(manager)).toHaveLength(0);
  });

  it('이미 완료된 건은 PIN을 검증하지 않고 그대로 돌려준다(멱등)', async () => {
    const claimedAt = new Date('2026-10-27T00:00:00Z');
    const { manager, store } = setup({ ...open, claimedAt });
    const verify = vi.fn();

    await expect(store.confirm('s', 'h', verify)).resolves.toEqual({
      status: 'CLAIMED',
      claimedAt,
      alreadyClaimed: true,
    });
    expect(verify).not.toHaveBeenCalled();
    expect(writes(manager)).toHaveLength(0);
  });

  it('PIN이 없으면 NO_PIN이다', async () => {
    const { store } = setup(open, false);

    await expect(store.confirm('s', 'h', async () => true)).resolves.toEqual({
      status: 'NO_PIN',
    });
  });

  it('잠겨 있으면 PIN을 검증하지 않고 남은 시간을 알려 준다', async () => {
    const { store } = setup({ ...open, lockRemaining: 42 });
    const verify = vi.fn();

    await expect(store.confirm('s', 'h', verify)).resolves.toEqual({
      status: 'LOCKED',
      retryAfterSeconds: 42,
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('PIN이 맞으면 수령을 완료하고 틀린 횟수를 지운다', async () => {
    const { manager, store } = setup({ ...open, failedAttempts: 3 });

    const result = await store.confirm('s', 'h', async () => true);

    expect(result).toMatchObject({ status: 'CLAIMED', alreadyClaimed: false });
    expect(writes(manager)).toHaveLength(1);
    expect(writes(manager)[0][0]).toContain('claimed_at = clock_timestamp()');
    expect(writes(manager)[0][0]).toContain('failed_attempts = 0');
  });

  it('PIN이 틀리면 횟수를 올리고 남은 횟수를 알려 준다', async () => {
    const { manager, store } = setup({ ...open, failedAttempts: 1 });

    await expect(store.confirm('s', 'h', async () => false)).resolves.toEqual({
      status: 'INVALID',
      attemptsLeft: GIFT_PIN_MAX_FAILED_ATTEMPTS - 2,
    });
    expect(writes(manager)[0][1]).toEqual(['c', 2]);
  });

  it('연속으로 한도만큼 틀리면 그 토큰만 잠그고 횟수를 0으로 되돌린다', async () => {
    const { manager, store } = setup({
      ...open,
      failedAttempts: GIFT_PIN_MAX_FAILED_ATTEMPTS - 1,
    });

    await expect(store.confirm('s', 'h', async () => false)).resolves.toEqual({
      status: 'LOCKED',
      retryAfterSeconds: GIFT_PIN_LOCK_SECONDS,
    });
    expect(writes(manager)[0][0]).toContain('locked_until');
    expect(writes(manager)[0][1]).toEqual(['c', GIFT_PIN_LOCK_SECONDS]);
    // 잠금은 claim 행에만 걸린다 — 박람회(설문) 단위 테이블은 건드리지 않는다
    expect(
      writes(manager).every(([sql]) => sql.includes('survey_gift_claim')),
    ).toBe(true);
  });
});
