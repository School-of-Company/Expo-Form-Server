import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 공개 설문 응답을 페이지로 읽는 내부 조회의 쿼리(#215). 첫 페이지는 `cursor` 없이 부르고, 그다음부터는
 * 앞 페이지의 `nextCursor`를 그대로 넘긴다.
 */
export const findPublicSurveyAnswersSchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export class FindPublicSurveyAnswersRequestDto extends createZodDto(
  findPublicSurveyAnswersSchema,
) {}
