/**
 * 설문 답변 접수 기록의 상태.
 *
 * RECEIVED → PUBLISHED → (STORED | REJECTED) 순으로만 전이한다. STORED/REJECTED는 종결 상태라
 * 그 이후 도착하는 이벤트는 전부 무시한다 — 늦게 도착한 이벤트가 최종 상태를 덮어쓰지 않게 하기
 * 위해서다.
 */
export enum SurveyAnswerSubmissionStatus {
  RECEIVED = 'RECEIVED',
  PUBLISHED = 'PUBLISHED',
  STORED = 'STORED',
  REJECTED = 'REJECTED',
}
