import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { postJson } from '../common/http/fetch-json.util.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type {
  EnteredTokenResult,
  ParticipationClient,
} from './participation-client.interface.js';

/** 참여 서비스 응답 모양. 경계이므로 캐스팅으로 믿지 않고 검증한다. */
const enteredTokenResponseSchema = z.object({
  // RFC 버전·변형 비트까지 보는 `z.uuid()` 대신 모양만 보는 `z.guid()`를 쓴다 — 경로의
  // `ParseUUIDPipe`처럼 박람회 서비스가 만든 id를 형식 차이로 거절하지 않기 위해서다.
  expoId: z.guid(),
});

/** {@link HttpParticipationClient} 설정. 값은 `ParticipationClientModule`이 환경 변수에서 읽어 넘긴다. */
export type HttpParticipationClientOptions = {
  /** 참여 서비스 주소. 끝의 `/`는 붙이지 않는다. */
  baseUrl: string;
  /** 참여 서비스가 `/internal` 경로를 보호하는 공유 시크릿의 사본. */
  internalToken: string;
};

/**
 * 참여 서비스의 내부 API를 HTTP로 호출하는 {@link ParticipationClient} 구현.
 *
 * 계약(잠정): `POST /internal/qr-tokens/resolve`에 `{token}`을 보내면, 입장이 확인된 토큰은
 * `200 {expoId}`, 없거나 아직 입장하지 않은 토큰은 `404`다. 참여 서비스가 아직 없어서 유저
 * 서비스의 내부 API 규약(`X-Internal-Token`, 민감한 값은 URL이 아니라 바디로)을 따라 폼 쪽에서
 * 먼저 정했다 — 참여 서비스를 만들 때 이 계약에 맞춘다.
 */
export class HttpParticipationClient implements ParticipationClient {
  private readonly logger = new Logger(HttpParticipationClient.name);

  constructor(private readonly options: HttpParticipationClientOptions) {}

  async findEnteredToken(token: string): Promise<EnteredTokenResult | null> {
    const url = `${this.options.baseUrl}/internal/qr-tokens/resolve`;

    try {
      return await postJson(url, { token }, enteredTokenResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
      });
    } catch (error) {
      // QR 토큰은 "이 종이를 받았다"는 증명이라 로그에 남기지 않는다. URL과 원인만 기록한다.
      this.logger.error(`참여 서비스 QR 토큰 확인 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
