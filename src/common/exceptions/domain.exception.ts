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

/** 조회·수정·삭제하려는 설문이 없을 때. */
export class SurveyNotFoundException extends DomainException {
  constructor() {
    super(
      ErrorCode.SURVEY_NOT_FOUND,
      '해당 설문을 찾을 수 없습니다.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 같은 (박람회, 참여자군) 조합의 설문을 또 만들려 할 때.
 * 폼과 달리 신청 방식 구분이 없어 이 두 값만으로 설문이 유일하게 식별된다.
 */
export class SurveyAlreadyExistsException extends DomainException {
  constructor() {
    super(
      ErrorCode.SURVEY_ALREADY_EXISTS,
      '같은 조건의 설문이 이미 존재합니다.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 제출된 답변이 저장된 문항 스펙과 맞지 않을 때 — 필수 문항 누락, 선택지에 없는 값,
 * `maxSelection` 초과, 스펙에 없는 문항 id 등. `ZodError`를 이 예외로 옮겨 담는다.
 */
export class SurveyAnswerInvalidException extends DomainException {
  constructor(detail: string) {
    super(
      ErrorCode.SURVEY_ANSWER_INVALID,
      `답변이 문항 스펙과 맞지 않습니다: ${detail}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * 같은 응답자가 같은 설문에 이미 답변을 제출했을 때.
 * 답변 자체는 이 서비스에 저장하지 않으므로, 이 판정은 유저 서비스가 내린다 — 여기서는
 * 유저 서비스가 알려준 결과를 도메인 예외로 옮겨 담을 뿐이다.
 */
export class SurveyAnswerAlreadyExistsException extends DomainException {
  constructor() {
    super(
      ErrorCode.SURVEY_ANSWER_ALREADY_EXISTS,
      '이미 제출한 설문입니다.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 전화번호로 응답자를 찾지 못했을 때. 해당 박람회에 등록되지 않았거나, 등록은 됐지만
 * 참여자군이 설문 대상과 달라 자격이 없는 경우도 같은 예외로 다룬다 — 둘을 구분해서 알려주면
 * 등록 여부 자체가 노출되기 때문이다.
 */
export class ParticipantNotFoundException extends DomainException {
  constructor() {
    super(
      ErrorCode.PARTICIPANT_NOT_FOUND,
      '해당 전화번호로 등록된 참가자를 찾을 수 없습니다.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 유저 서비스가 그 전화번호로 응답자를 하나로 특정할 수 없다고 답했을 때(409). 과거 데이터에서 같은
 * 번호가 다른 표기로 여러 번 저장된 경우다. 다시 시도해도 결과가 같으므로 재시도를 안내하는 503과
 * 구분한다 — 운영자가 데이터를 정리해야 제출할 수 있다.
 */
export class ParticipantAmbiguousException extends DomainException {
  constructor() {
    super(
      ErrorCode.PARTICIPANT_AMBIGUOUS,
      '전화번호로 응답자를 하나로 특정할 수 없습니다. 운영자에게 문의해 주세요.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 다른 서비스(유저·참여 서비스)를 호출했는데 응답을 받지 못했을 때. 비정상 응답, 타임아웃,
 * 연결 실패, 계약과 다른 응답 모양을 모두 포함한다.
 *
 * "찾을 수 없음"(404)과 구분하는 이유: 장애를 "없음"으로 돌려보내면 정상 응답자가 거절된다.
 * 클라이언트는 이 코드를 받으면 잠시 후 다시 시도하면 된다.
 */
export class ExternalServiceUnavailableException extends DomainException {
  constructor() {
    super(
      ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
      '잠시 후 다시 시도해 주세요.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
