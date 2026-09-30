/**
 * 전화번호에서 숫자만 남긴다.
 *
 * v1 클라이언트에서 하이픈 포함 여부가 클라이언트마다 달라 조회 키가 어긋난 적이 있다
 * (Expo-Client#237). 전화번호를 조회 키로 쓰는 모든 경로가 이 함수를 거치게 해서,
 * 하이픈·공백·괄호가 섞여 들어와도 같은 값으로 취급되게 한다.
 */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}
