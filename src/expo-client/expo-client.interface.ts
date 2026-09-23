/** {@link ExpoClient}를 주입받을 때 쓰는 DI 토큰. */
export const EXPO_CLIENT = 'EXPO_CLIENT';

/** 박람회(expo) 서비스에 대한 읽기 전용 게이트웨이. */
export interface ExpoClient {
  /** expoId가 박람회 서비스에 실제로 존재하는지 확인한다. */
  exists(expoId: string): Promise<boolean>;
}
