/**
 * 폼의 용도. 등록용(`REGISTRATION`)은 박람회 신청(사전·현장 등록)을 받는 폼이고, 박람회마다 (참여자군, 신청방식)
 * 조합당 하나뿐이다. 프로그램용(`PROGRAM`)은 프로그램 신청에 쓰는 폼으로 같은 유형이어도 여러 개 만들 수 있다.
 */
export enum FormPurpose {
  /** 박람회 신청(사전·현장 등록)용. (박람회, 참여자군, 신청방식)당 하나. */
  REGISTRATION = 'REGISTRATION',
  /** 프로그램 신청용. 같은 유형이어도 여러 개. */
  PROGRAM = 'PROGRAM',
}
