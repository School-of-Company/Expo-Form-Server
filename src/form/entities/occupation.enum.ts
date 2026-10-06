/**
 * 일반 참가자의 직업. 직업 필드(`DynamicFormType.OCCUPATION`)의 선택지 키로 쓴다 — 키가 고정돼
 * 있어야 신청 처리 쪽이 답변 값만 보고 학생·교사인지 알 수 있다. 화면에 보일 이름은 폼마다 자유다.
 */
export enum Occupation {
  /** 초등학생 — 소속 학교 필드가 보인다. */
  ELEMENTARY_STUDENT = 'ELEMENTARY_STUDENT',
  /** 중학생 — 소속 학교 필드가 보인다. */
  MIDDLE_SCHOOL_STUDENT = 'MIDDLE_SCHOOL_STUDENT',
  /** 고등학생 — 소속 학교 필드가 보인다. */
  HIGH_SCHOOL_STUDENT = 'HIGH_SCHOOL_STUDENT',
  /** 교직원 — 소속 학교 필드가 보인다. */
  SCHOOL_STAFF = 'SCHOOL_STAFF',
  /** 예비교사 — 아직 학교에 소속되지 않아 소속 학교 필드가 보이지 않는다. */
  PRE_SERVICE_TEACHER = 'PRE_SERVICE_TEACHER',
  /** 보호자/학부모 */
  PARENT = 'PARENT',
  /** 일반인 */
  GENERAL = 'GENERAL',
  /** 교사 — 소속 학교 필드가 보인다. */
  TEACHER = 'TEACHER',
}
