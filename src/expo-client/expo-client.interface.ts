/** {@link ExpoClient}를 주입받을 때 쓰는 DI 토큰. */
export const EXPO_CLIENT = 'EXPO_CLIENT';

/** 박람회 진행 기간. 날짜는 한국 시간 기준 `yyyy-MM-dd` 문자열이다. */
export interface ExpoPeriod {
  startedDay: string;
  finishedDay: string;
}

/**
 * 박람회 기능 설정 중 이 서비스가 따르는 키(Expo-Expo-Server#265 카탈로그). 값은 선행 기능까지 반영한 실효
 * 값(`effectiveEnabled`)이다 — 선택값만 보면 부모 OFF를 놓친다.
 */
export interface ExpoFeatures {
  /** 새 설문 응답을 받는다. 끄면 공개·일반·연수 설문 모두 새 응답을 거절한다. */
  survey: boolean;
  /** 새 추첨 참여·당첨을 부여한다. 꺼도 설문이 켜져 있으면 응답은 받는다. */
  surveyLottery: boolean;
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
   * 박람회의 현재 기능 설정을 박람회 서비스에서 직접 읽는다. 박람회가 없으면 null이다. 이벤트로 복제한 값은 늦을 수
   * 있어 OFF인데 새 응답을 받는 근거가 되므로 쓰지 않는다(Expo-Expo-Server#266).
   *
   * @throws {ExternalServiceUnavailableException} 박람회 서비스에 확인할 수 없거나, 응답에 기능 설정이 없거나
   *   해석할 수 없을 때 — 모르는 상태를 ON으로도 OFF로도 대신하지 않는다
   */
  findFeatures(expoId: string): Promise<ExpoFeatures | null>;

  /**
   * 프로그램용 폼 수정을 박람회 서비스에 예약한다(`kind=UPDATE`). 예약이 끝나면 커밋·실패와 상관없이
   * {@link releaseProgramFormChange}로 풀어야 한다 — 풀지 않으면 그 폼의 연결·변경이 계속 막힌다.
   *
   * @throws {ProgramFormGuardianPolicyInUseException} 보호자 동반 정책이 참조해 박람회 서비스가 거절했을 때(409)
   * @throws {ProgramFormChangeInProgressException} 이 폼에 진행 중인 변경이 있어 박람회 서비스가 거절했을 때(409,
   *   `code=PROGRAM_FORM_CHANGE_IN_PROGRESS`)
   * @throws {ProgramFormReservationUnavailableException} 그 밖의 실패 — 확인 못 하면 수정을 막는다(fail-closed)
   */
  reserveProgramFormUpdate(formId: string, changeId: string): Promise<void>;

  /** 폼 변경 예약을 푼다. 실패는 로그만 남긴다 — 이미 끝난 수정의 결과를 바꾸지 않는다. */
  releaseProgramFormChange(formId: string, changeId: string): Promise<void>;
}
