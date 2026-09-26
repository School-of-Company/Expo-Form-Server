/** 클라이언트가 분기 처리에 쓰는 도메인 에러 코드. 메시지와 달리 바뀌지 않는 계약이다. */
export enum ErrorCode {
  FORM_NOT_FOUND = 'FORM_NOT_FOUND',
  FORM_ALREADY_EXISTS = 'FORM_ALREADY_EXISTS',
  SURVEY_NOT_FOUND = 'SURVEY_NOT_FOUND',
  SURVEY_ALREADY_EXISTS = 'SURVEY_ALREADY_EXISTS',
}
