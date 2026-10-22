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

/**
 * 폼 수정에서 `occupationOpenAt`을 생략해 기존 값을 유지하는데, 바뀐 접수 기간이 그 값을 벗어날 때.
 * 오픈 시각을 함께 보내거나(null이면 해제) 기간을 그 값이 들어가게 잡아야 한다.
 */
export class FormOccupationOpenAtOutOfPeriodException extends DomainException {
  constructor() {
    super(
      ErrorCode.FORM_OCCUPATION_OPEN_AT_OUT_OF_PERIOD,
      '기존 교원·예비교사 외 오픈 시각이 접수 기간을 벗어납니다. 오픈 시각을 함께 수정해 주세요.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * 프로그램용 폼을 고칠 때 보낸 `expectedVersion`이 현재 버전과 다를 때. 다른 관리자가 먼저 고쳤거나, 폼을
 * 불러온 뒤 정의가 바뀐 것이다. 폼을 다시 읽고 고쳐서 다시 보내야 한다.
 */
export class FormVersionConflictException extends DomainException {
  constructor() {
    super(
      ErrorCode.FORM_VERSION_CONFLICT,
      '폼이 그 사이에 변경되었습니다. 최신 폼을 다시 불러와 주세요.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 프로그램용 폼을 삭제하거나 적용 기간을 줄이려 할 때. 회차가 이 폼을 쓰고 있는지 확인하는 보호(박람회 서비스의
 * 참조 검사와 변경 예약)가 아직 연결되지 않았다. 접수 중인 회차의 폼이 지워지거나 모집 기간 밖으로 줄면 신청자가
 * 폼 정의를 읽지 못하므로, 보호가 연결되기 전에는 이 두 변경을 안전하게 거절한다.
 */
export class ProgramFormProtectionPendingException extends DomainException {
  constructor() {
    super(
      ErrorCode.PROGRAM_FORM_PROTECTION_PENDING,
      '회차가 이 폼을 쓰는지 확인하는 보호가 아직 연결되지 않아 프로그램용 폼을 삭제하거나 기간을 줄일 수 없습니다.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 박람회 서비스가 프로그램용 폼 수정 예약을 409로 거절했을 때. 보호자 동반 정책이 폼 `version`과 문항 id를
 * 그대로 저장하므로, 수정하면 그 회차의 신청이 모두 막힌다. 문항을 바꾸려면 새 폼을 만들어 써야 한다.
 */
export class ProgramFormGuardianPolicyInUseException extends DomainException {
  constructor() {
    super(
      ErrorCode.PROGRAM_FORM_GUARDIAN_POLICY_IN_USE,
      '보호자 동반 정책에서 사용 중인 폼은 수정할 수 없습니다.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 박람회 서비스가 이 폼에 이미 진행 중인 변경(다른 사람의 수정 등)이 있다며 수정 예약을 409로 거절했을 때.
 * 보호자 동반 정책 참조({@link ProgramFormGuardianPolicyInUseException})와 달리 잠시 뒤 다시 시도하면 풀린다.
 */
export class ProgramFormChangeInProgressException extends DomainException {
  constructor() {
    super(
      ErrorCode.PROGRAM_FORM_CHANGE_IN_PROGRESS,
      '다른 변경이 진행 중이라 이 폼을 지금 수정할 수 없습니다. 잠시 후 폼을 다시 불러온 뒤 시도해 주세요.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 프로그램용 폼을 고치기 전에 박람회 서비스에 변경을 예약하지 못했을 때. 보호자 동반 정책이 이 폼을 쓰는지
 * 확인할 수 없으니 안전하게 수정을 막는다(fail-closed).
 *
 * `EXTERNAL_SERVICE_UNAVAILABLE`과 따로 두는 이유: 그 코드는 "잠시 후 다시 시도"를 뜻하지만, 이 실패는
 * 박람회 서비스 설정이 없거나 변경 예약 API가 아직 배포되지 않은 경우처럼 재시도로 풀리지 않을 수 있다.
 * 관리자가 재시도만 반복하지 않도록 문구에 그 가능성을 밝힌다.
 */
export class ProgramFormReservationUnavailableException extends DomainException {
  constructor() {
    super(
      ErrorCode.PROGRAM_FORM_RESERVATION_UNAVAILABLE,
      '박람회 서비스에서 이 폼의 사용 여부를 확인하지 못해 수정할 수 없습니다. 계속되면 운영진에게 문의해 주세요.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/** 같은 박람회에 같은 제목의 프로그램용 폼을 또 만들거나 제목을 겹치게 바꾸려 할 때. */
export class ProgramFormTitleDuplicatedException extends DomainException {
  constructor() {
    super(
      ErrorCode.PROGRAM_FORM_TITLE_DUPLICATED,
      '같은 박람회에 같은 제목의 프로그램용 폼이 이미 있습니다.',
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
 * 응답이 하나라도 있는 설문의 문항을 바꾸려 할 때(#179). 문항은 수정할 때마다 새로 만들어져 id가 바뀌므로,
 * 열어 둔 화면의 제출이 400이 되고 문항 스냅샷이 없는 공개 답변은 어느 문항의 답인지 알 수 없게 된다. 문항이
 * 지금과 똑같으면 설문 제목·안내 문구·경품 추첨 설정은 바꿀 수 있다.
 */
export class SurveyAlreadyAnsweredException extends DomainException {
  constructor() {
    super(
      ErrorCode.SURVEY_ALREADY_ANSWERED,
      '응답이 있는 설문은 문항을 추가·삭제·수정하거나 순서를 바꿀 수 없습니다.',
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
 * 공개 설문 응답 커서를 해석할 수 없거나, 형식이 어긋나거나, 지금 조회하는 설문의 커서가 아닐 때(#215).
 * 다른 박람회의 커서나 설문을 다시 만들기 전의 커서도 여기에 든다.
 */
export class SurveyCursorInvalidException extends DomainException {
  constructor() {
    super(
      ErrorCode.SURVEY_CURSOR_INVALID,
      '설문 응답 커서가 올바르지 않습니다.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * 참가자 세션의 전화번호로 응답자를 찾지 못했을 때. 해당 박람회에 등록되지 않았거나, 등록은 됐지만
 * 참여자군이 설문 대상과 달라 자격이 없는 경우도 같은 예외로 다룬다. 세션을 거친 뒤에만 나오므로
 * 이 응답은 SMS로 인증한 본인 번호에 대해서만 받는다(#147).
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
 * 참가자 세션(SMS 인증 후 유저 서비스가 발급하는 `PARTICIPANT_SESSION` 쿠키)이 없거나, 다른 행사의 것이거나,
 * 만료됐을 때. 코드는 유저·신청 서비스와 같은 `SESSION_REQUIRED`/`SESSION_EXPIRED`라 클라이언트가 인증 화면과
 * 만료 안내를 같은 방식으로 가른다.
 */
export class ParticipantSessionException extends DomainException {
  constructor(
    code:
      | ErrorCode.SESSION_REQUIRED
      | ErrorCode.SESSION_EXPIRED = ErrorCode.SESSION_REQUIRED,
  ) {
    super(
      code,
      code === ErrorCode.SESSION_EXPIRED
        ? '인증 세션이 만료되었습니다.'
        : '전화 인증이 필요합니다.',
      HttpStatus.UNAUTHORIZED,
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

/**
 * 삭제된 박람회에 폼·설문을 만들려 할 때. 박람회가 삭제되면 그 박람회의 데이터는 모두 지워지고 새로
 * 만들 수도 없다(삭제와 겹친 생성이 지워졌어야 할 데이터를 되살리지 않게 막는다).
 */
export class ExpoDeletedException extends DomainException {
  constructor() {
    super(ErrorCode.EXPO_DELETED, '삭제된 박람회입니다.', HttpStatus.GONE);
  }
}

/**
 * 박람회 서비스에 존재하지 않는 박람회에 폼·설문을 만들려 할 때. v1처럼 박람회가 있어야 그 아래에
 * 폼·설문을 만들 수 있다(삭제된 박람회는 {@link ExpoDeletedException}).
 */
export class ExpoNotFoundException extends DomainException {
  constructor() {
    super(
      ErrorCode.EXPO_NOT_FOUND,
      '박람회를 찾을 수 없습니다.',
      HttpStatus.NOT_FOUND,
    );
  }
}
