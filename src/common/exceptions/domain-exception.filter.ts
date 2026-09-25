import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from './domain.exception.js';

/** 도메인 예외를 `{ code, message }` 형태의 응답 바디로 통일한다. */
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
