import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 발급된 토큰 목록. 응답자 페이지 주소는 프론트가 알고 있으므로, 링크 조립과 QR 렌더링은
 * 어드민 프론트가 맡는다.
 */
export const issueSurveyQrTokensResponseSchema = z.object({
  tokens: z.array(z.string()),
});

export class IssueSurveyQrTokensResponseDto extends createZodDto(
  issueSurveyQrTokensResponseSchema,
) {}
