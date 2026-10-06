import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INTERNAL_TOKEN_MIN_LENGTH } from '../common/http/internal-token.constants.js';
import { HttpUserClient } from './http-user-client.js';
import { USER_CLIENT } from './user-client.interface.js';

/**
 * 유저 서비스 연동 설정을 읽어 {@link HttpUserClient}를 만든다.
 *
 * 주소와 내부 토큰이 없으면 부팅 단계에서 실패한다 — 설정 누락을 첫 요청에서야 알게 되면
 * 그때는 이미 응답자가 답변 제출에 실패한 뒤다. 토큰 값은 오류 메시지에 싣지 않는다.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: USER_CLIENT,
      inject: [ConfigService],
      useFactory(config: ConfigService) {
        const internalToken = config.getOrThrow<string>(
          'USER_SERVICE_INTERNAL_TOKEN',
        );
        if (internalToken.length < INTERNAL_TOKEN_MIN_LENGTH) {
          throw new Error(
            `USER_SERVICE_INTERNAL_TOKEN must be at least ${INTERNAL_TOKEN_MIN_LENGTH} characters.`,
          );
        }

        return new HttpUserClient({
          // 끝에 `/`가 붙어 있어도 경로가 `//internal`이 되지 않게 한다.
          baseUrl: config
            .getOrThrow<string>('USER_SERVICE_URL')
            .replace(/\/$/u, ''),
          internalToken,
        });
      },
    },
  ],
  exports: [USER_CLIENT],
})
export class UserClientModule {}
