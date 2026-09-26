import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum.js';

/**
 * 비즈니스 규칙 위반을 나타내는 예외.
 *
 * 응답 바디를 문자열이 아니라 `{ code, message }` 객체로 들고 있는 게 중요하다 —
 * `dicoshot-nest`가 전역 catch-all 필터로 `exception.getResponse()`를 그대로 내보내기 때문에,
 * 이렇게 해두면 어느 필터가 먼저 잡든(우리 필터든, Dicoshot이든, Nest 기본이든) 같은 형식이 나간다.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super({ code: errorCode, message }, status);
  }
}

/** 조회·수정·삭제하려는 폼이 없을 때. */
export class FormNotFoundException extends DomainException {
  constructor() {
    super(
      ErrorCode.FORM_NOT_FOUND,
      '해당 폼을 찾을 수 없습니다.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 같은 (박람회, 참여자군, 신청방식) 조합의 폼을 또 만들려 할 때.
 * 이 조합은 폼을 유일하게 식별하는 값이라 중복을 허용하지 않는다.
 */
export class FormAlreadyExistsException extends DomainException {
  constructor() {
    super(
      ErrorCode.FORM_ALREADY_EXISTS,
      '같은 조건의 폼이 이미 존재합니다.',
      HttpStatus.CONFLICT,
    );
  }
}
