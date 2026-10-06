import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { INTERNAL_TOKEN_MIN_LENGTH } from '../common/http/internal-token.constants.js';
import { HttpParticipationClient } from './http-participation-client.js';
import {
  PARTICIPATION_CLIENT,
  type ParticipationClient,
} from './participation-client.interface.js';

/** 참여 서비스 설정이 없을 때 쓰는 구현. 부팅은 막지 않고, 호출하면 503으로 응답한다. */
const unavailableParticipationClient: ParticipationClient = {
  async findEnteredToken() {
    throw new ExternalServiceUnavailableException();
  },
};

/**
 * 참여 서비스 연동 설정을 읽어 {@link HttpParticipationClient}를 만든다.
 *
 * `UserClientModule`과 달리 설정이 아예 없으면 부팅을 막지 않는다. 참여 서비스가 아직 배포되지
 * 않아서 dev/prod에 넣을 주소가 없고, 이 클라이언트를 쓰는 건 현장 QR 설문뿐이기 때문이다 —
 * 그 경로만 503이 되고 나머지 기능은 그대로 동작한다. 주소와 토큰 중 하나만 있으면 설정 실수이므로
 * 부팅 단계에서 실패한다. 참여 서비스가 배포되면 둘 다 필수로 바꾼다.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PARTICIPATION_CLIENT,
      inject: [ConfigService],
      useFactory(config: ConfigService): ParticipationClient {
        const baseUrl = config.get<string>('PARTICIPATION_SERVICE_URL') ?? '';
        const internalToken =
          config.get<string>('PARTICIPATION_SERVICE_INTERNAL_TOKEN') ?? '';
        const hasBaseUrl = baseUrl !== '';
        const hasInternalToken = internalToken !== '';

        if (!hasBaseUrl && !hasInternalToken) {
          new Logger(ParticipationClientModule.name).warn(
            '참여 서비스 설정(PARTICIPATION_SERVICE_URL, PARTICIPATION_SERVICE_INTERNAL_TOKEN)이 없어 현장 QR 설문 API는 503을 반환합니다.',
          );
          return unavailableParticipationClient;
        }

        if (hasBaseUrl !== hasInternalToken) {
          throw new Error(
            'PARTICIPATION_SERVICE_URL and PARTICIPATION_SERVICE_INTERNAL_TOKEN must be set together.',
          );
        }

        if (internalToken.length < INTERNAL_TOKEN_MIN_LENGTH) {
          throw new Error(
            `PARTICIPATION_SERVICE_INTERNAL_TOKEN must be at least ${INTERNAL_TOKEN_MIN_LENGTH} characters.`,
          );
        }

        return new HttpParticipationClient({
          // 끝에 `/`가 붙어 있어도 경로가 `//internal`이 되지 않게 한다.
          baseUrl: baseUrl.replace(/\/$/u, ''),
          internalToken,
        });
      },
    },
  ],
  exports: [PARTICIPATION_CLIENT],
})
export class ParticipationClientModule {}
