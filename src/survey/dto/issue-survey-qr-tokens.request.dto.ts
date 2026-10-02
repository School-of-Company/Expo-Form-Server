import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 한 번에 인쇄할 QR 장수. */
export const issueSurveyQrTokensSchema = z.object({
  count: z.number().int().min(1).max(1000),
});

export class IssueSurveyQrTokensRequestDto extends createZodDto(
  issueSurveyQrTokensSchema,
) {}
