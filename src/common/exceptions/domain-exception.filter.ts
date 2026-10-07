import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from './domain.exception.js';

/**
 * 도메인 예외를 `{ code, message }` 형태의 응답 바디로 통일한다.
 *
 * `DomainException` 자체가 이미 같은 모양의 바디를 들고 있어서, 이 필터가 없어도(또는 다른
 * 전역 필터가 먼저 잡아도) 결과는 같다. 그럼에도 명시적으로 두는 이유는, 나중에 응답 형식을
 * 바꾸고 싶을 때 손댈 지점을 한 곳으로 고정해두기 위해서다.
 */
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter<DomainException> {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    response.status(exception.getStatus()).json({
      code: exception.errorCode,
      message: exception.message,
    });
  }
}
