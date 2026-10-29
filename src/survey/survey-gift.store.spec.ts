import { describe, expect, it, vi } from 'vitest';
import { SurveyGiftStore } from './survey-gift.store.js';

/** UPDATE는 `[행들, 건수]`, SELECT는 행 배열을 돌려주는 TypeORM `query`를 흉내 낸다. */
function setup(claim: { claimedAt: Date | null } | null, updated: number) {
  const manager = {
    query: vi.fn(async (sql: string, _params?: unknown[]) =>
      sql.startsWith('UPDATE') ? [[], updated] : claim ? [claim] : [],
    ),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };

  return { manager, store: new SurveyGiftStore(dataSource as never) };
}

describe('SurveyGiftStore.confirm', () => {
  it('토큰이 없으면 NOT_FOUND다', async () => {
    const { store } = setup(null, 0);

    await expect(store.confirm('s', 'h')).resolves.toEqual({
      status: 'NOT_FOUND',
    });
  });

  it('아직 완료되지 않은 토큰은 조건부 UPDATE로 완료하고 PIN·잠금을 보지 않는다', async () => {
    const claimedAt = new Date('2026-10-29T01:00:00Z');
    const { manager, store } = setup({ claimedAt }, 1);

    await expect(store.confirm('s', 'h')).resolves.toEqual({
      status: 'CLAIMED',
      claimedAt,
      alreadyClaimed: false,
    });
    const sqls = manager.query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toContain('claimed_at IS NULL');
    expect(sqls[0]).toContain('survey_id = $1 AND token_hash = $2');
    expect(sqls.some((sql) => sql.includes('survey_gift_pin'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('FOR UPDATE'))).toBe(false);
  });

  it('이미 완료된 토큰은 갱신하지 않고 기존 완료 상태를 돌려준다', async () => {
    const claimedAt = new Date('2026-10-29T00:00:00Z');
    const { store } = setup({ claimedAt }, 0);

    await expect(store.confirm('s', 'h')).resolves.toEqual({
      status: 'CLAIMED',
      claimedAt,
      alreadyClaimed: true,
    });
  });
});
