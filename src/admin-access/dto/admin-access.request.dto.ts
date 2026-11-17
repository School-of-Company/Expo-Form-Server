/** Expo가 JWT와 박람회별 역할을 판정한다. STAFF 토큰도 원문 그대로 전달한다. */
export class AdminAccessRequestDto {
  readonly expoId: string;
  readonly authorization: string;
  readonly permission?: 'STATS_READ';
}
