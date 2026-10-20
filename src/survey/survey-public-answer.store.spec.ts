import { describe, expect, it, vi } from 'vitest';
import { Occupation } from '../common/enums/occupation.enum.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';

function setup(lottery: {
  sequence: number;
  numbers: number[];
  alreadyJoined?: boolean;
}) {
  const manager = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('survey_lottery_participant')) {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- RETURNING 컬럼 이름 그대로
        return lottery.alreadyJoined === true ? [] : [{ survey_id: 's' }];
      }

      return sql.startsWith('SELECT')
        ? [
            {
              /* eslint-disable @typescript-eslint/naming-convention -- DB 컬럼 이름 그대로 흉내 낸다 */
              lottery_enabled: true,
              lottery_numbers: lottery.numbers,
              lottery_sequence: lottery.sequence,
              /* eslint-enable @typescript-eslint/naming-convention */
            },
          ]
        : [];
    }),
    insert: vi.fn().mockResolvedValue(undefined),
    increment: vi.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  const store = new SurveyPublicAnswerStore(dataSource as never);

  return { manager, store };
}

const sqlOf = (manager: ReturnType<typeof setup>['manager']) =>
  manager.query.mock.calls.map(([sql]) => sql);

describe('SurveyPublicAnswerStore.create', () => {
  it('번호 없는 응답은 당첨 순번이어도 당첨되지 않고 순번을 소비하지 않는다', async () => {
    const { manager, store } = setup({ sequence: 0, numbers: [1] });

    const outcome = await store.create('s', {}, Occupation.GENERAL, null);

    expect(outcome).toEqual({ won: false, drawNumber: null });
    expect(manager.increment).toHaveBeenCalledOnce();
    expect(
      sqlOf(manager).some((sql) => sql.includes('lottery_sequence = $2')),
    ).toBe(false);
    expect(
      sqlOf(manager).some((sql) => sql.includes('survey_draw_result')),
    ).toBe(false);
  });

  it('번호가 있는 응답은 순번을 소비하고 당첨 순번이면 당첨 기록을 남긴다', async () => {
    const { manager, store } = setup({ sequence: 0, numbers: [1] });

    const outcome = await store.create(
      's',
      {},
      Occupation.GENERAL,
      '01012345678',
    );

    expect(outcome).toEqual({ won: true, drawNumber: 1 });
    expect(
      sqlOf(manager).some((sql) => sql.includes('survey_draw_result')),
    ).toBe(true);
  });

  it('같은 설문에서 이미 참여한 번호는 순번을 소비하지 않고 당첨되지 않는다', async () => {
    const { manager, store } = setup({
      sequence: 0,
      numbers: [1],
      alreadyJoined: true,
    });

    const outcome = await store.create(
      's',
      {},
      Occupation.GENERAL,
      '01012345678',
    );

    expect(outcome).toEqual({ won: false, drawNumber: null });
    expect(manager.increment).toHaveBeenCalledOnce();
    expect(
      sqlOf(manager).some((sql) => sql.includes('lottery_sequence = $2')),
    ).toBe(false);
    expect(
      sqlOf(manager).some((sql) => sql.includes('survey_draw_result')),
    ).toBe(false);
  });
});
