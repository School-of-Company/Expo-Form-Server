import { describe, expect, it } from 'vitest';
import {
  LOTTERY_NUMBERS_MAX_COUNT,
  updateSurveyLotterySchema,
} from './survey-lottery.dto.js';

describe('updateSurveyLotterySchema', () => {
  it('켜짐 여부와 당첨 번호 목록을 받는다', () => {
    const result = updateSurveyLotterySchema.safeParse({
      enabled: true,
      numbers: [30, 62, 10_000],
    });

    expect(result.success).toBe(true);
  });

  it('번호 목록은 비워 둘 수 있다', () => {
    expect(
      updateSurveyLotterySchema.safeParse({ enabled: false, numbers: [] })
        .success,
    ).toBe(true);
  });

  it.each([
    ['0 이하', [0]],
    ['음수', [-3]],
    ['정수가 아닌 값', [1.5]],
    ['중복', [30, 30]],
    [
      '최대 개수 초과',
      Array.from({ length: LOTTERY_NUMBERS_MAX_COUNT + 1 }, (_, i) => i + 1),
    ],
  ])('당첨 번호가 %s이면 거부한다', (_label, numbers) => {
    expect(
      updateSurveyLotterySchema.safeParse({ enabled: true, numbers }).success,
    ).toBe(false);
  });
});
