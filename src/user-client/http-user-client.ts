import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExternalServiceUnavailableException,
  ParticipantAmbiguousException,
} from '../common/exceptions/domain.exception.js';
import { ExternalServiceError } from '../common/http/external-service.error.js';
import { fetchJson, postJson } from '../common/http/fetch-json.util.js';
import type { InternalServiceOptions } from '../common/http/internal-service.config.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type {
  ParticipantLookupInput,
  ParticipantLookupResult,
  SurveyAnswerEventResult,
  UserClient,
} from './user-client.interface.js';

/** 유저 서비스 응답 모양. 경계이므로 캐스팅으로 믿지 않고 검증한다. */
const participantLookupResponseSchema = z.object({
  participantId: z.number().int(),
  participationType: z.enum(ParticipationType),
});

/** 접수 이벤트 처리 결과 응답 모양. */
const surveyAnswerEventResultSchema = z.object({
  status: z.enum(['STORED', 'REJECTED']),
  reason: z.string().nullish(),
});

/**
 * 유저 서비스의 내부 API(`/internal/...`)를 HTTP로 호출하는 {@link UserClient} 구현.
 *
 * 계약
 * - 응답자 조회: Expo-User-Server#23의 `POST /internal/participants/resolve`
 * - 접수 이벤트 처리 결과(Expo-User-Server PR #39): `GET /internal/survey-answer-events/{eventId}`
 *   → `200 {eventId, status, reason}`, 처리한 적 없으면 `404`
 *
 * 서비스 간 호출은 Gateway를 거치지 않으므로 `X-Internal-Token`으로 인증하고, 전화번호는
 * URL·접근 로그에 남지 않도록 바디로만 보낸다. `eventId`는 개인정보가 아닌 UUID라 경로에 실어도 된다.
 */
export class HttpUserClient implements UserClient {
  private readonly logger = new Logger(HttpUserClient.name);

  constructor(private readonly options: InternalServiceOptions) {}

  async findParticipant(
    input: ParticipantLookupInput,
  ): Promise<ParticipantLookupResult | null> {
    return this.post(
      '/internal/participants/resolve',
      input,
      participantLookupResponseSchema,
      // 같은 번호가 다른 표기로 여러 번 저장돼 있어 응답자를 특정할 수 없다는 뜻이다. 재시도로는 풀리지 않는다.
      { conflict: () => new ParticipantAmbiguousException() },
    );
  }

  async findSurveyAnswerResult(
    eventId: string,
  ): Promise<SurveyAnswerEventResult | null> {
    const result = await this.request(
      `/internal/survey-answer-events/${encodeURIComponent(eventId)}`,
      async (url, headers) =>
        fetchJson(url, surveyAnswerEventResultSchema, { headers }),
    );

    return result === null
      ? null
      : { status: result.status, reason: result.reason ?? null };
  }

  /** 바디로 보내는 내부 API 호출. 실패 처리는 {@link request}와 같다. */
  private async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options: { conflict?: () => Error } = {},
  ): Promise<T | null> {
    return this.request(
      path,
      async (url, headers) => postJson(url, body, schema, { headers }),
      options,
    );
  }

  /**
   * 내부 API를 호출한다. 404는 null이고, 그 외 실패는 모두 서비스 장애로 바꿔 던진다 —
   * 장애를 "없음"으로 돌려보내면 호출부가 잘못된 결론을 내린다. 409에 따로 뜻이 있는 API는
   * `conflict`로 던질 예외를 정한다.
   */
  private async request<T>(
    path: string,
    send: (url: string, headers: Record<string, string>) => Promise<T | null>,
    { conflict }: { conflict?: () => Error } = {},
  ): Promise<T | null> {
    const url = `${this.options.baseUrl}${path}`;

    try {
      return await send(url, {
        [INTERNAL_TOKEN_HEADER]: this.options.internalToken,
      });
    } catch (error) {
      if (
        conflict !== undefined &&
        error instanceof ExternalServiceError &&
        error.status === 409
      ) {
        throw conflict();
      }

      // 전화번호와 토큰이 실려 있는 요청 내용은 남기지 않는다. URL과 원인만 기록한다.
      this.logger.error(`유저 서비스 호출 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
