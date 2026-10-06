import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { postJson } from '../common/http/fetch-json.util.js';
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
 * - 접수 이벤트 처리 결과(잠정, Expo-User-Server#11이 이에 맞춤): `POST /internal/survey-answer-events/resolve`에
 *   `{eventId}` → `200 {status, reason}`, 처리한 적 없으면 `404`
 *
 * 서비스 간 호출은 Gateway를 거치지 않으므로 `X-Internal-Token`으로 인증하고, 전화번호는
 * URL·접근 로그에 남지 않도록 바디로만 보낸다.
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
    );
  }

  async findSurveyAnswerResult(
    eventId: string,
  ): Promise<SurveyAnswerEventResult | null> {
    const result = await this.post(
      '/internal/survey-answer-events/resolve',
      { eventId },
      surveyAnswerEventResultSchema,
    );

    return result === null
      ? null
      : { status: result.status, reason: result.reason ?? null };
  }

  /**
   * 내부 API를 호출한다. 404는 null이고, 그 외 실패는 모두 서비스 장애로 바꿔 던진다 —
   * 장애를 "없음"으로 돌려보내면 호출부가 잘못된 결론을 내린다.
   */
  private async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    const url = `${this.options.baseUrl}${path}`;

    try {
      return await postJson(url, body, schema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
      });
    } catch (error) {
      // 전화번호와 토큰이 실려 있는 요청 내용은 남기지 않는다. URL과 원인만 기록한다.
      this.logger.error(`유저 서비스 호출 실패: ${url}`, error);
      throw new ExternalServiceUnavailableException();
    }
  }
}
