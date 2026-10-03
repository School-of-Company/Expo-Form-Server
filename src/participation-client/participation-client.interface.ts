/** {@link ParticipationClient}를 주입받을 때 쓰는 DI 토큰. */
export const PARTICIPATION_CLIENT = 'PARTICIPATION_CLIENT';

/** 입장이 확인된 종이 QR 토큰의 정보. */
export interface EnteredTokenResult {
  /** 토큰만으로는 어느 박람회인지 알 수 없어서, 설문을 찾으려면 이 값이 필요하다. */
  expoId: string;
}

/**
 * 참여 서비스에 묻는 계약. 현장 종이 QR은 참여 서비스가 발급하고 입구에서 스캔해 입장을
 * 기록한다 — 이 서비스는 토큰을 발급하지 않고, 설문 응답이 들어올 때 그 토큰이 입장한 것인지만
 * 확인한다.
 */
export interface ParticipationClient {
  /**
   * 입장이 확인된 토큰이면 그 정보를, 없는 토큰이거나 아직 입장하지 않은 토큰이면 null을
   * 돌려준다. 둘을 구분해서 알려주면 토큰의 존재 여부가 노출되므로 호출부는 같은 404로 다룬다.
   */
  findEnteredToken(token: string): Promise<EnteredTokenResult | null>;
}
