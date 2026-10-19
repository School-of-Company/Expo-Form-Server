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

  /**
   * 프로그램용 폼 수정을 박람회 서비스에 예약한다(`kind=UPDATE`). 예약이 끝나면 커밋·실패와 상관없이
   * {@link releaseProgramFormChange}로 풀어야 한다 — 풀지 않으면 그 폼의 연결·변경이 계속 막힌다.
   *
   * @throws {ProgramFormGuardianPolicyInUseException} 박람회 서비스가 거절했을 때(409)
   * @throws {ProgramFormReservationUnavailableException} 그 밖의 실패 — 확인 못 하면 수정을 막는다(fail-closed)
   */
  reserveProgramFormUpdate(formId: string, changeId: string): Promise<void>;

  /** 폼 변경 예약을 푼다. 실패는 로그만 남긴다 — 이미 끝난 수정의 결과를 바꾸지 않는다. */
  releaseProgramFormChange(formId: string, changeId: string): Promise<void>;
}
