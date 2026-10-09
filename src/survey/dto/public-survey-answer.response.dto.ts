import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 공개 설문 답변 제출 결과. 경품 추첨이 켜져 있으면 이 응답이 당첨인지 알려 응답 화면이 "당첨되었습니다"를
 * 띄운다 — 전화번호를 입력하지 않은 응답자도 똑같이 알 수 있다. 추첨이 꺼져 있으면 항상 당첨이 아니다.
 */
export const publicSurveyAnswerResponseSchema = z.object({
  /** 이 응답이 경품에 당첨됐는지. */
  won: z.boolean(),
  /** 당첨된 순번(몇 번째 응답). 당첨이 아니면 null이다. */
  drawNumber: z.int().positive().nullable(),
});

export class PublicSurveyAnswerResponseDto extends createZodDto(
  publicSurveyAnswerResponseSchema,
) {}
