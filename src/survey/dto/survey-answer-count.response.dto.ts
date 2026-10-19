import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 설문의 누적 응답 수. 공개 제출 순번과 같이 늘어 경품 당첨 시점을 알려 주므로 인증 없이 열린 설문 조회에는
 * 싣지 않고 로그인이 필요한 이 응답으로만 내보낸다(#169).
 */
export const surveyAnswerCountSchema = z.object({
  totalAnswers: z.number().int().nonnegative(),
});

export class SurveyAnswerCountResponseDto extends createZodDto(
  surveyAnswerCountSchema,
) {}
