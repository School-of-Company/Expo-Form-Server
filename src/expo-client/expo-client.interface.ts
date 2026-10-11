/** {@link ExpoClient}를 주입받을 때 쓰는 DI 토큰. */
export const EXPO_CLIENT = 'EXPO_CLIENT';

/** 박람회 진행 기간. 날짜는 한국 시간 기준 `yyyy-MM-dd` 문자열이다. */
export interface ExpoPeriod {
  startedDay: string;
  finishedDay: string;
}

/** 박람회(expo) 서비스에 대한 읽기 전용 게이트웨이. */
export interface ExpoClient {
  /** expoId가 박람회 서비스에 실제로 존재하는지 확인한다. */
  exists(expoId: string): Promise<boolean>;

  /**
   * 박람회 진행 기간을 조회한다. 박람회가 없으면 null이다.
   *
   * @throws {ExternalServiceUnavailableException} 박람회 서비스에 확인할 수 없을 때 — "없음"과 다르다
   */
  findPeriod(expoId: string): Promise<ExpoPeriod | null>;
}
