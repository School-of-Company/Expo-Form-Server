/**
 * 참가자의 직업(유형). 폼과 설문이 함께 쓴다. 사전등록 공식 요구사항의 참여자 유형(유, 초, 중고, 일반, 교사,
 * 예비교사)과 같다.
 *
 * - 폼: 직업 필드(`DynamicFormType.OCCUPATION`)의 선택지 키로 쓴다 — 키가 고정돼 있어야 신청 처리
 *   쪽이 답변 값만 보고 학생·교사인지 알 수 있다. 화면에 보일 이름은 폼마다 자유다.
 * - 종이 QR 설문: 응답자가 익명이라 신청 정보로 직업을 알 수 없어서, 답변과 함께 직접 받아 저장한다.
 */
export enum Occupation {
  /** 유 — 유치원생 */
  KINDERGARTEN_STUDENT = 'KINDERGARTEN_STUDENT',
  /** 초 — 초등학생 */
  ELEMENTARY_STUDENT = 'ELEMENTARY_STUDENT',
  /** 중고 — 중학생과 고등학생 */
  MIDDLE_HIGH_SCHOOL_STUDENT = 'MIDDLE_HIGH_SCHOOL_STUDENT',
  /** 일반 — 학부모, 교직원 등 그 밖의 참가자 */
  GENERAL = 'GENERAL',
  /** 교사 — 소속을 입력한다. */
  TEACHER = 'TEACHER',
  /** 예비교사 — 소속을 입력한다. */
  PRE_SERVICE_TEACHER = 'PRE_SERVICE_TEACHER',
}

/**
 * 소속을 받는 직업. 교사와 예비교사만 소속과 이름을 입력하고, 학생·교직원·보호자·일반은 소속을 받지 않는다
 * (사전등록 공식 요구사항). 소속은 명찰에 "소속 이름"으로 찍힌다. 직업·소속 학교 필드의 조건부 표시와 동반자
 * 입력이 같은 기준을 쓴다.
 */
export const SCHOOL_OCCUPATIONS: readonly Occupation[] = [
  Occupation.TEACHER,
  Occupation.PRE_SERVICE_TEACHER,
];
