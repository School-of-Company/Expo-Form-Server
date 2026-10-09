import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 당첨 번호 목록의 최대 개수. 관리자 화면에서 한 번에 다룰 수 있는 크기로 막는다. */
export const LOTTERY_NUMBERS_MAX_COUNT = 100;

/**
 * 당첨 번호(행운의 번호) 목록. 1 이상의 정수이고 중복이 없어야 하며, 비워 두면 추첨하지 않는다. 설문을 만들 때와
 * 추첨 설정을 바꿀 때 같은 규칙을 쓴다.
 */
export const lotteryNumbersSchema = z
  .array(z.int().min(1))
  .max(LOTTERY_NUMBERS_MAX_COUNT)
  .refine((numbers) => new Set(numbers).size === numbers.length, {
    message: '당첨 번호는 중복될 수 없습니다.',
  });

/**
 * 경품 추첨 설정 변경 요청. 진행 중에 목록을 바꿔도 이미 지나간 순번은 다시 오지 않는다.
 */
export const updateSurveyLotterySchema = z.object({
  enabled: z.boolean(),
  numbers: lotteryNumbersSchema,
});

export class UpdateSurveyLotteryRequestDto extends createZodDto(
  updateSurveyLotterySchema,
) {}

/** 경품 추첨 설정과 현재까지 센 순번. 관리자 화면이 순번을 보고 목록을 고친다. */
export const surveyLotteryResponseSchema = z.object({
  enabled: z.boolean(),
  numbers: z.array(z.int()),
  currentSequence: z.int().nonnegative(),
});

export class SurveyLotteryResponseDto extends createZodDto(
  surveyLotteryResponseSchema,
) {}
