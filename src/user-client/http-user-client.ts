import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExternalServiceUnavailableException,
  ParticipantAmbiguousException,
  ParticipantSessionException,
} from '../common/exceptions/domain.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.enum.js';
import { ExternalServiceError } from '../common/http/external-service.error.js';
import { fetchJson, postJson } from '../common/http/fetch-json.util.js';
import type { InternalServiceOptions } from '../common/http/internal-service.config.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type {
  ParticipantLookupInput,
  ParticipantLookupResult,
  ParticipantSessionInput,
  SurveyAnswerEventResult,
  UserClient,
} from './user-client.interface.js';

/** 유저 서비스 응답 모양. 경계이므로 캐스팅으로 믿지 않고 검증한다. */
const participantLookupResponseSchema = z.object({
  participantId: z.number().int(),
  participationType: z.enum(ParticipationType),
});

/** 특정 상태 코드에 따로 뜻이 있는 API가 던질 예외. 없으면 서비스 장애로 본다. */
type StatusErrors = {
  conflict?: () => Error;
  /** undefined를 돌려주면 다른 실패처럼 서비스 장애로 본다. */
  unauthorized?: (code: string | undefined) => Error | undefined;
};

/** 참가자 세션 응답 모양. `expiresAt`은 UTC 로컬 시각(`yyyy-MM-dd'T'HH:mm:ss`)이다. */
const participantSessionResponseSchema = z.object({
  expoId: z.string(),
  phoneNumber: z.string().regex(/^01\d{8,9}$/u),
  expiresAt: z.string(),
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
 * - 참가자 세션 확인: `POST /internal/participant-sessions/resolve` `{expoId, sessionId}`
 *   → `200 {expoId, phoneNumber, expiresAt}`, 없거나 다른 행사·만료면 `401 {code}`
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
      'resolve_participant',
      // 같은 번호가 다른 표기로 여러 번 저장돼 있어 응답자를 특정할 수 없다는 뜻이다. 재시도로는 풀리지 않는다.
      { conflict: () => new ParticipantAmbiguousException() },
    );
  }

  async resolveParticipantSession(
    input: ParticipantSessionInput,
  ): Promise<string> {
    const session = await this.post(
      '/internal/participant-sessions/resolve',
      input,
      participantSessionResponseSchema,
      'resolve_session',
      {
        // 코드 없는 401은 내부 토큰 불일치일 수 있다 — 세션 문제로 덮지 않고 장애로 남긴다.
        unauthorized: (code) =>
          code === ErrorCode.SESSION_REQUIRED ||
          code === ErrorCode.SESSION_EXPIRED
            ? new ParticipantSessionException(code)
            : undefined,
      },
    );
    // 신청 서비스와 같이 응답을 다시 확인한다 — 다른 행사의 세션이 섞여 오면 계약 위반이다.
    const expiresAt = Date.parse(`${session?.expiresAt ?? ''}Z`);
    if (session?.expoId !== input.expoId || Number.isNaN(expiresAt)) {
      this.logger.error(
        '유저 서비스 참가자 세션 응답이 계약과 다름: /internal/participant-sessions/resolve',
      );
      throw new ExternalServiceUnavailableException();
    }

    if (expiresAt <= Date.now()) {
      throw new ParticipantSessionException(ErrorCode.SESSION_EXPIRED);
    }

    return session.phoneNumber;
  }

  async findSurveyAnswerResult(
    eventId: string,
  ): Promise<SurveyAnswerEventResult | null> {
    const result = await this.request(
      `/internal/survey-answer-events/${encodeURIComponent(eventId)}`,
      async (url, headers) =>
        fetchJson(url, surveyAnswerEventResultSchema, {
          headers,
          observe: { service: 'user', operation: 'survey_answer_result' },
        }),
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
    operation: string,
    options: StatusErrors = {},
  ): Promise<T | null> {
    return this.request(
      path,
      async (url, headers) =>
        postJson(url, body, schema, {
          headers,
          observe: { service: 'user', operation },
        }),
      options,
    );
  }

  /**
   * 내부 API를 호출한다. 404는 null이고, 그 외 실패는 모두 서비스 장애로 바꿔 던진다 —
   * 장애를 "없음"으로 돌려보내면 호출부가 잘못된 결론을 내린다. 409·401에 따로 뜻이 있는 API는
   * `conflict`·`unauthorized`로 던질 예외를 정한다.
   */
  private async request<T>(
    path: string,
    send: (url: string, headers: Record<string, string>) => Promise<T | null>,
    { conflict, unauthorized }: StatusErrors = {},
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

      const unauthorizedError =
        error instanceof ExternalServiceError && error.status === 401
          ? unauthorized?.(error.code)
          : undefined;
      if (unauthorizedError !== undefined) {
        throw unauthorizedError;
      }

      // 전화번호·세션 ID와 토큰이 실려 있는 요청 내용은 남기지 않는다. URL과 원인만 기록한다.
      this.logger.error(`유저 서비스 호출 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
