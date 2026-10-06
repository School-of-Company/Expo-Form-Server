/**
 * 일반 참가자의 직업. 직업 필드(`DynamicFormType.OCCUPATION`)의 선택지 키로 쓴다 — 키가 고정돼
 * 있어야 신청 처리 쪽이 답변 값만 보고 교사인지 알 수 있다. 화면에 보일 이름은 폼마다 자유다.
 */
export enum Occupation {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  GENERAL = 'GENERAL',
}
