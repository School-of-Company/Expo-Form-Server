import type { ConfigService } from '@nestjs/config';
import { INTERNAL_TOKEN_MIN_LENGTH } from './internal-token.constants.js';

/** 내부 서비스(`/internal/...`)를 부를 때 필요한 값. */
export type InternalServiceOptions = {
  /** 서비스 주소. 끝의 `/`는 떼어 둔다. */
  baseUrl: string;
  /** 받는 쪽이 `/internal` 경로를 보호하는 공유 시크릿의 사본. */
  internalToken: string;
};

/** 내부 서비스 설정을 담은 환경 변수 이름. */
export type InternalServiceConfigKeys = {
  urlKey: string;
  tokenKey: string;
};

/**
 * 내부 서비스 연동 설정을 읽는다. 둘 다 없으면 연동하지 않는다는 뜻으로 null을 돌려준다.
 *
 * 하나만 있거나 토큰이 짧으면 설정 실수이므로 던진다 — 모듈 팩토리에서 부르므로 부팅 단계에서
 * 실패한다. 토큰 값은 오류 메시지에 싣지 않는다.
 */
export function readInternalServiceOptions(
  config: ConfigService,
  { urlKey, tokenKey }: InternalServiceConfigKeys,
): InternalServiceOptions | null {
  const baseUrl = config.get<string>(urlKey) ?? '';
  const internalToken = config.get<string>(tokenKey) ?? '';

  if (baseUrl === '' && internalToken === '') {
    return null;
  }

  if (baseUrl === '' || internalToken === '') {
    throw new Error(`${urlKey} and ${tokenKey} must be set together.`);
  }

  if (internalToken.length < INTERNAL_TOKEN_MIN_LENGTH) {
    throw new Error(
      `${tokenKey} must be at least ${INTERNAL_TOKEN_MIN_LENGTH} characters.`,
    );
  }

  // 끝에 `/`가 붙어 있어도 경로가 `//internal`이 되지 않게 한다.
  return { baseUrl: baseUrl.replace(/\/$/u, ''), internalToken };
}

/** {@link readInternalServiceOptions}와 같지만, 설정이 아예 없어도 던진다. 반드시 연동해야 하는 서비스용이다. */
export function requireInternalServiceOptions(
  config: ConfigService,
  keys: InternalServiceConfigKeys,
): InternalServiceOptions {
  const options = readInternalServiceOptions(config, keys);
  if (options === null) {
    throw new Error(`${keys.urlKey} and ${keys.tokenKey} are required.`);
  }

  return options;
}
