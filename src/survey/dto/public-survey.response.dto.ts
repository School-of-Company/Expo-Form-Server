import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { SurveyEntity } from '../entities/survey.entity.js';
import {
  surveyResponseSchema,
  toSurveyResponse,
} from './survey.response.dto.js';

/**
 * 공개 설문 조회 응답. 일반 설문 응답에서 누적 응답 수(`totalAnswers`)를 빼고 경품 추첨이 켜져 있는지를
 * 더한다 — 응답 화면이 이 값을 보고 번호 입력 문항과 안내를 보일지 정한다. 누적 응답 수는 추첨 순번과 같이
 * 늘어서 당첨 시점을 알려 주므로 인증 없는 조회에는 싣지 않는다(#169).
 */
export const publicSurveyResponseSchema = surveyResponseSchema
  .omit({ totalAnswers: true })
  .extend({
    lotteryEnabled: z.boolean(),
  });

export class PublicSurveyResponseDto extends createZodDto(
  publicSurveyResponseSchema,
) {}

export function toPublicSurveyResponse(
  survey: SurveyEntity,
): PublicSurveyResponseDto {
  const { totalAnswers: _totalAnswers, ...rest } = toSurveyResponse(survey);

  return { ...rest, lotteryEnabled: survey.lotteryEnabled };
}
