import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { SurveyEntity } from '../entities/survey.entity.js';
import {
  surveyResponseSchema,
  toSurveyResponse,
} from './survey.response.dto.js';

/**
 * 공개 설문 조회 응답. 일반 설문 응답에 경품 추첨이 켜져 있는지를 더한다 — 응답 화면이 이 값을 보고 번호
 * 입력 문항과 안내를 보일지 정한다.
 */
export const publicSurveyResponseSchema = surveyResponseSchema.extend({
  lotteryEnabled: z.boolean(),
});

export class PublicSurveyResponseDto extends createZodDto(
  publicSurveyResponseSchema,
) {}

export function toPublicSurveyResponse(
  survey: SurveyEntity,
): PublicSurveyResponseDto {
  return {
    ...toSurveyResponse(survey),
    lotteryEnabled: survey.lotteryEnabled,
  };
}
