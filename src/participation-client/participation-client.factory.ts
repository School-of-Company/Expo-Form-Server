import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { readInternalServiceOptions } from '../common/http/internal-service.config.js';
import { HttpParticipationClient } from './http-participation-client.js';
import type { ParticipationClient } from './participation-client.interface.js';

/** 참여 서비스 연동 설정을 담은 환경 변수 이름. */
export const PARTICIPATION_SERVICE_CONFIG_KEYS = {
  urlKey: 'PARTICIPATION_SERVICE_URL',
  tokenKey: 'PARTICIPATION_SERVICE_INTERNAL_TOKEN',
};

/** 참여 서비스 설정이 없을 때 쓰는 구현. 부팅은 막지 않고, 호출하면 503으로 응답한다. */
const unavailableParticipationClient: ParticipationClient = {
  async findEnteredToken() {
    throw new ExternalServiceUnavailableException();
  },
};

/**
 * 참여 서비스 연동 설정으로 {@link ParticipationClient}를 만든다.
 *
 * 유저 서비스와 달리 설정이 아예 없으면 부팅을 막지 않는다. 참여 서비스가 아직 배포되지 않아서
 * dev/prod에 넣을 주소가 없고, 이 클라이언트를 쓰는 건 현장 QR 설문뿐이기 때문이다 — 그 경로만
 * 503이 되고 나머지 기능은 그대로 동작한다. 참여 서비스가 배포되면 `requireInternalServiceOptions`로
 * 바꿔 필수로 만든다.
 */
export function createParticipationClient(
  config: ConfigService,
): ParticipationClient {
  const options = readInternalServiceOptions(
    config,
    PARTICIPATION_SERVICE_CONFIG_KEYS,
  );
  if (options === null) {
    new Logger('ParticipationClient').warn(
      '참여 서비스 설정(PARTICIPATION_SERVICE_URL, PARTICIPATION_SERVICE_INTERNAL_TOKEN)이 없어 현장 QR 설문 API는 503을 반환합니다.',
    );
    return unavailableParticipationClient;
  }

  return new HttpParticipationClient(options);
}
