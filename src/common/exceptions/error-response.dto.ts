import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorCode } from './error-code.enum.js';

/**
 * 도메인 예외의 응답 바디(`DomainExceptionFilter`가 만드는 모양). 클라이언트는 메시지가 아니라
 * `code`로 분기한다 — 메시지는 바뀔 수 있지만 코드는 계약이다.
 */
export const errorResponseSchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string(),
});

export class ErrorResponseDto extends createZodDto(errorResponseSchema) {}
