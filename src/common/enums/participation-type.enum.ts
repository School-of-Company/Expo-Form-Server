/**
 * 폼/설문이 대상으로 하는 참여자군. TRAINEE: 교육생, STANDARD: 일반 참가자.
 * `form`, `survey` 양쪽 도메인이 공유하는 값이라 두 모듈 어디에도 속하지 않는 공용 위치에 둔다.
 */
export enum ParticipationType {
  TRAINEE = 'TRAINEE',
  STANDARD = 'STANDARD',
}
