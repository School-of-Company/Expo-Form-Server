import type { ConfigService } from '@nestjs/config';
import { requireInternalServiceOptions } from '../common/http/internal-service.config.js';
import { HttpUserClient } from './http-user-client.js';
import type { UserClient } from './user-client.interface.js';

/** 유저 서비스 연동 설정을 담은 환경 변수 이름. */
export const USER_SERVICE_CONFIG_KEYS = {
  urlKey: 'USER_SERVICE_URL',
  tokenKey: 'USER_SERVICE_INTERNAL_TOKEN',
};

/**
 * 유저 서비스 연동 설정으로 {@link UserClient}를 만든다.
 *
 * 설정이 없으면 부팅 단계에서 실패한다 — 설정 누락을 첫 요청에서야 알게 되면 그때는 이미
 * 응답자가 답변 제출에 실패한 뒤다.
 */
export function createUserClient(config: ConfigService): UserClient {
  return new HttpUserClient(
    requireInternalServiceOptions(config, USER_SERVICE_CONFIG_KEYS),
  );
}
