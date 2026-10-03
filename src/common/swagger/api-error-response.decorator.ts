import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../exceptions/error-response.dto.js';

/**
 * 도메인 예외가 내려주는 실패 응답을 문서화한다. 모든 도메인 예외가 같은 바디
 * (`{ code, message }`)를 쓰므로 상태 코드와 설명만 라우트마다 다르다.
 */
export function ApiErrorResponse(status: number, description: string) {
  return applyDecorators(
    ApiResponse({ status, description, type: ErrorResponseDto }),
  );
}
