import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../exceptions/error-response.dto.js';

/**
 * 도메인 예외가 내려주는 실패 응답을 문서화한다. 모든 도메인 예외가 같은 바디
 * (`{ code, message }`)를 쓰므로 상태 코드와 설명만 라우트마다 다르다.
 */
// Nest의 `@ApiResponse`, `@Get`처럼 데코레이터는 PascalCase가 관례라 함수 이름 규칙을 적용하지 않는다.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function ApiErrorResponse(status: number, description: string) {
  return applyDecorators(
    ApiResponse({ status, description, type: ErrorResponseDto }),
  );
}

/**
 * 가드나 요청 검증처럼 도메인 예외가 아닌 곳에서 나는 실패 응답을 문서화한다. 이 응답은
 * `DomainExceptionFilter`를 거치지 않아 Nest 기본 바디(`{ statusCode, message }`)이고 `code`가 없다.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function ApiHttpErrorResponse(status: number, description: string) {
  return applyDecorators(
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['statusCode', 'message'],
        properties: {
          statusCode: { type: 'number', example: status },
          message: { type: 'string' },
          error: { type: 'string' },
          errors: { type: 'array', items: { type: 'object' } },
        },
      },
    }),
  );
}
