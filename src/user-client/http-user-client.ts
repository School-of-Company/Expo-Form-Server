import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExternalServiceUnavailableException,
  ParticipantAmbiguousException,
} from '../common/exceptions/domain.exception.js';
import { ExternalServiceError } from '../common/http/external-service.error.js';
import { postJson } from '../common/http/fetch-json.util.js';
import type { InternalServiceOptions } from '../common/http/internal-service.config.js';
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

/**
 * 유저 서비스의 내부 API(`/internal/...`)를 HTTP로 호출하는 {@link UserClient} 구현.
 *
 * 계약은 Expo-User-Server#23의 `POST /internal/participants/resolve`다. 서비스 간 호출은
 * Gateway를 거치지 않으므로 `X-Internal-Token`으로 인증하고, 전화번호는 URL·접근 로그에
 * 남지 않도록 바디로만 보낸다.
 */
export class HttpUserClient implements UserClient {
  private readonly logger = new Logger(HttpUserClient.name);

  constructor(private readonly options: InternalServiceOptions) {}

  async findParticipant(
    input: ParticipantLookupInput,
  ): Promise<ParticipantLookupResult | null> {
    const url = `${this.options.baseUrl}/internal/participants/resolve`;

    try {
      return await postJson(url, input, participantLookupResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
      });
    } catch (error) {
      // 같은 번호가 다른 표기로 여러 번 저장돼 있어 응답자를 특정할 수 없다는 뜻이다. 재시도로는 풀리지 않는다.
      if (error instanceof ExternalServiceError && error.status === 409) {
        throw new ParticipantAmbiguousException();
      }

      // 전화번호와 토큰이 실려 있는 요청 내용은 남기지 않는다. URL과 원인만 기록한다.
      this.logger.error(`유저 서비스 응답자 조회 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
