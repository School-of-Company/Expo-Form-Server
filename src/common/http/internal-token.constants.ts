/**
 * 서비스 간 호출(Gateway를 거치지 않는 호출)에 실어 보내는 공유 시크릿 헤더. 받는 쪽이 토큰을
 * 소유하고 `/internal` 하위 경로를 이 값으로 보호한다(Expo-Config-Server#14).
 */
export const INTERNAL_TOKEN_HEADER = 'X-Internal-Token';

/** 받는 쪽(유저 서비스 `InternalProperties`)이 요구하는 최소 길이. 짧으면 받는 쪽이 기동하지 않는다. */
export const INTERNAL_TOKEN_MIN_LENGTH = 32;
