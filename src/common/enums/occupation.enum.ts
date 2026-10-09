/**
 * 참가자의 직업(구분). 폼과 설문이 함께 쓰며, 유저 서비스의 `Occupation`과 값이 같아야 신청이 통과한다.
 *
 * - 폼: 직업 필드(`DynamicFormType.OCCUPATION`)의 선택지 키로 쓴다 — 키가 고정돼 있어야 신청 처리
 *   쪽이 답변 값만 보고 학생·교사인지 알 수 있다. 화면에 보일 이름은 폼마다 자유다.
 * - 공개 링크 설문: 응답자가 익명이라 신청 정보로 직업을 알 수 없어서, 답변과 함께 직접 받아 저장한다.
 */
export enum Occupation {
  /** 유치원생 */
  KINDERGARTEN_STUDENT = 'KINDERGARTEN_STUDENT',
  /** 초등학생 */
  ELEMENTARY_STUDENT = 'ELEMENTARY_STUDENT',
  /** 중학생 */
  MIDDLE_SCHOOL_STUDENT = 'MIDDLE_SCHOOL_STUDENT',
  /** 고등학생 */
  HIGH_SCHOOL_STUDENT = 'HIGH_SCHOOL_STUDENT',
  /** 교직원 */
  SCHOOL_STAFF = 'SCHOOL_STAFF',
  /** 보호자/학부모 */
  PARENT = 'PARENT',
  /** 일반인 — 위 구분에 속하지 않는 사람 */
  GENERAL = 'GENERAL',
  /** 교사 — 소속 학교 필드가 보인다. */
  TEACHER = 'TEACHER',
  /** 예비교사 — 소속(학교·기관) 필드가 보인다. */
  PRE_SERVICE_TEACHER = 'PRE_SERVICE_TEACHER',
}

/**
 * 소속을 받는 직업. 교사와 예비교사다(소속 이름이 입구 명찰에 찍히는 대상). 직업·소속 학교 필드의 조건부
 * 표시와 동반자 입력이 같은 기준을 쓴다.
 */
export const SCHOOL_OCCUPATIONS: readonly Occupation[] = [
  Occupation.TEACHER,
  Occupation.PRE_SERVICE_TEACHER,
];
