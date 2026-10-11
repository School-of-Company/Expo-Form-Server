import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { fetchJson } from '../common/http/fetch-json.util.js';
import type { InternalServiceOptions } from '../common/http/internal-service.config.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type { ExpoClient, ExpoPeriod } from './expo-client.interface.js';

/** 박람회가 있다는 사실만 쓰고 내용은 쓰지 않아서, 객체 모양인지만 본다. */
const expoResponseSchema = z.looseObject({});

/** 박람회 기간 응답 모양. 날짜는 `yyyy-MM-dd` 문자열이다. */
const expoPeriodResponseSchema = z.looseObject({
  startedDay: z.string(),
  finishedDay: z.string(),
});

/**
 * 박람회 서비스의 내부 API를 HTTP로 호출하는 {@link ExpoClient} 구현.
 *
 * 계약: `GET /internal/expo/{expoId}`에 `X-Internal-Token`을 보내면, 박람회가 있으면 `200`(박람회
 * 기간), 없으면 `404`다(박람회 서비스 `InternalExpoController`).
 */
export class HttpExpoClient implements ExpoClient {
  private readonly logger = new Logger(HttpExpoClient.name);

  constructor(private readonly options: InternalServiceOptions) {}

  /**
   * 박람회가 있으면 true, 404면 false다. 그 밖의 응답·타임아웃·연결 실패는 "없음"이 아니라 장애이므로
   * 503으로 바꿔 던진다 — 장애를 "없음"으로 돌려보내면 있는 박람회에 폼을 못 만든다.
   */
  async exists(expoId: string): Promise<boolean> {
    const url = `${this.options.baseUrl}/internal/expo/${encodeURIComponent(expoId)}`;

    try {
      const result = await fetchJson(url, expoResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
      });

      return result !== null;
    } catch (error) {
      this.logger.error(`박람회 서비스 존재 확인 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }

  /** 박람회가 없으면(404) null이고, 그 밖의 실패는 "없음"이 아니라 장애이므로 503으로 바꿔 던진다. */
  async findPeriod(expoId: string): Promise<ExpoPeriod | null> {
    const url = `${this.options.baseUrl}/internal/expo/${encodeURIComponent(expoId)}`;

    try {
      const result = await fetchJson(url, expoPeriodResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
      });

      return result === null
        ? null
        : { startedDay: result.startedDay, finishedDay: result.finishedDay };
    } catch (error) {
      this.logger.error(`박람회 서비스 기간 조회 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
