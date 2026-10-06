import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { postJson } from '../common/http/fetch-json.util.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type {
  ParticipantLookupInput,
  ParticipantLookupResult,
  UserClient,
} from './user-client.interface.js';

/** 유저 서비스 응답 모양. 경계이므로 캐스팅으로 믿지 않고 검증한다. */
const participantLookupResponseSchema = z.object({
  participantId: z.number().int(),
  participationType: z.enum(ParticipationType),
});

/** {@link HttpUserClient} 설정. 값은 `UserClientModule`이 환경 변수에서 읽어 넘긴다. */
export type HttpUserClientOptions = {
  /** 유저 서비스 주소(예: `http://expo-user-server:8080`). 끝의 `/`는 붙이지 않는다. */
  baseUrl: string;
  /** 유저 서비스가 `/internal` 경로를 보호하는 공유 시크릿의 사본. */
  internalToken: string;
};

/**
 * 유저 서비스의 내부 API(`/internal/...`)를 HTTP로 호출하는 {@link UserClient} 구현.
 *
 * 계약은 Expo-User-Server#23의 `POST /internal/participants/resolve`다. 서비스 간 호출은
 * Gateway를 거치지 않으므로 `X-Internal-Token`으로 인증하고, 전화번호는 URL·접근 로그에
 * 남지 않도록 바디로만 보낸다.
 */
export class HttpUserClient implements UserClient {
  private readonly logger = new Logger(HttpUserClient.name);

  constructor(private readonly options: HttpUserClientOptions) {}

  async findParticipant(
    input: ParticipantLookupInput,
  ): Promise<ParticipantLookupResult | null> {
    const url = `${this.options.baseUrl}/internal/participants/resolve`;

    try {
      return await postJson(url, input, participantLookupResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
      });
    } catch (error) {
      // 전화번호와 토큰이 실려 있는 요청 내용은 남기지 않는다. URL과 원인만 기록한다.
      this.logger.error(`유저 서비스 응답자 조회 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
