import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ParticipantNotFoundException,
  ParticipantSessionException,
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { isUniqueViolation } from '../common/exceptions/postgres-error.util.js';
import { normalizePhoneNumber } from '../common/phone-number.util.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import {
  USER_CLIENT,
  type UserClient,
} from '../user-client/user-client.interface.js';
import type { MySurveyAnswerResponseDto } from './dto/my-survey-answer.response.dto.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { toQuestionSnapshots } from './question-snapshot.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyStore } from './survey.store.js';

/** 제출 기록을 새로 만들 때 채워야 하는 값들 — id와 감사 컬럼은 DB/TypeORM이 정한다. */
type SubmissionFields = Omit<
  SurveyAnswerSubmissionEntity,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * 설문 답변 제출을 담당한다.
 *
 * 답변 데이터 자체는 이 저장소에 저장하지 않는다(2026-09-25 확정) — 여기서는 저장된 문항
 * 스펙으로 제출값을 검증하고, 검증이 끝난 답변을 접수 기록(아웃박스)으로 저장한다. 실제
 * 저장은 유저 서비스가 Kafka로 비동기 처리한다(#29) — 그래서 `submit()`은 이 기록을 만드는
 * 데까지만 책임지고, 실제 발행은 {@link SurveyAnswerRelayService}가 담당한다.
 */
@Injectable()
export class SurveyAnswerService {
  private readonly logger = new Logger(SurveyAnswerService.name);

  constructor(
    private readonly surveyStore: SurveyStore,
    private readonly submissionStore: SurveyAnswerSubmissionStore,
    @Inject(USER_CLIENT) private readonly userClient: UserClient,
  ) {}

  /**
   * 참가자 세션으로 응답자를 확인하고, 저장된 문항 스펙으로 답변을 검증한 뒤 접수 기록을 남긴다.
   * 접수 시점에 설문의 누적 응답 수를 늘린다 — 유저 서비스가 나중에 거절하면
   * {@link SurveyAnswerResultConsumer}가 되돌린다.
   *
   * 응답자는 본문의 전화번호가 아니라 세션의 검증된 전화번호로 정한다(#147). 본문 번호를 믿으면
   * 토큰 없이 남의 번호로 대신 제출하거나, 404/400 차이로 번호의 등록 여부를 알아낼 수 있다.
   * 세션 확인을 가장 먼저 해서 인증되지 않은 요청은 다른 결과 없이 401만 받는다. `sessionId`는
   * `PARTICIPANT_SESSION` 쿠키 값이고, 없으면 undefined다.
   *
   * 대상 설문은 (박람회, 참여자군) 조합으로 식별한다 — standard/trainee 제출 라우트가
   * 각각 자신의 참여자군을 고정해서 넘긴다.
   *
   * @throws {ParticipantSessionException} 세션이 없거나 다른 행사의 것이거나 만료됐을 때(401)
   * @throws {SurveyNotFoundException} 해당 조합의 설문이 없을 때
   * @throws {ParticipantNotFoundException} 이 설문의 참여자군에서 세션의 전화번호로 등록된 응답자를
   *   찾을 수 없을 때
   * @throws {ExternalServiceUnavailableException} 유저 서비스에서 응답을 받지 못했을 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙(필수 여부·선택지·최대 선택 개수)과
   *   맞지 않을 때
   * @throws {SurveyAnswerAlreadyExistsException} 같은 응답자의 활성(= 거절되지 않은) 제출
   *   기록이 이미 있을 때
   */
  async submit(
    expoId: string,
    participationType: ParticipationType,
    sessionId: string | undefined,
    dto: SubmitSurveyAnswerRequestDto,
  ): Promise<void> {
    const phoneNumber = await this.resolveSessionPhone(expoId, sessionId);

    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      participationType,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    // 이 설문의 참여자군 테이블에서만 찾는다. 다른 참여자군으로 등록된 번호도 "없음"으로 돌아오므로,
    // 등록되지 않은 경우와 참여자군이 안 맞는 경우가 같은 예외로 묶인다.
    const participant = await this.userClient.findParticipant({
      expoId: survey.expoId,
      phoneNumber,
      participationType: survey.participationType,
    });
    // 요청한 참여자군과 다른 응답은 계약 위반이지만, 다른 참여자군의 응답자가 답변하게 두지 않도록
    // 여기서도 한 번 더 막는다.
    if (participant?.participationType !== survey.participationType) {
      throw new ParticipantNotFoundException();
    }

    const schema = buildAnswerSchema(survey.dynamicSurveys);
    const result = schema.safeParse(dto.answers);
    if (!result.success) {
      throw new SurveyAnswerInvalidException(result.error.message);
    }

    const existing = await this.submissionStore.findActiveByKey(
      survey.id,
      phoneNumber,
    );
    if (existing) {
      throw new SurveyAnswerAlreadyExistsException();
    }

    const submission = Object.assign(new SurveyAnswerSubmissionEntity(), {
      surveyId: survey.id,
      expoId: survey.expoId,
      participationType: survey.participationType,
      phoneNumber,
      eventId: randomUUID(),
      status: SurveyAnswerSubmissionStatus.RECEIVED,
      rejectReason: null,
      retryCount: 0,
      publishedAt: null,
      eventVersion: null,
      payload: {
        answers: result.data,
        personalInformationStatus: dto.personalInformationStatus,
        // 설문을 나중에 수정해도 이 답변의 문항 제목을 복원할 수 있게 제출 당시의 문항을 남긴다.
        questions: toQuestionSnapshots(survey.dynamicSurveys),
      },
    } satisfies SubmissionFields);

    // 위 findActiveByKey와 이 저장 사이에 같은 응답자의 다른 요청이 끼어들면 둘 다 통과한다.
    // 그럴 땐 활성 제출 유니크 제약이 한쪽을 막는데, 그 위반을 그대로 두면 409가 아니라 500이
    // 나간다 — 여기서 잡아 도메인 예외로 바꾼다.
    let created: boolean;
    try {
      created = await this.submissionStore.createReceived(submission);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SurveyAnswerAlreadyExistsException();
      }

      throw error;
    }

    // 위에서 설문을 찾은 뒤 박람회 일괄 삭제가 끼어들면 기록 없이 돌아온다.
    if (!created) {
      throw new SurveyNotFoundException();
    }

    this.logger.log(
      `설문 답변 접수 완료: surveyId=${survey.id}, eventId=${submission.eventId}`,
    );
  }

  /**
   * 참가자 세션의 응답자가 이 설문에 낸 가장 최근 제출의 상태를 돌려준다(#203). 응답자는 {@link submit}과
   * 같이 세션의 전화번호로 정한다. 참여자 등록 여부는 묻지 않는다 — 등록되지 않은 번호는 제출 기록도 없다.
   *
   * @throws {ParticipantSessionException} 세션이 없거나 다른 행사의 것이거나 만료됐을 때(401)
   * @throws {SurveyNotFoundException} 해당 조합의 설문이 없을 때
   * @throws {ExternalServiceUnavailableException} 유저 서비스에서 응답을 받지 못했을 때
   */
  async findMine(
    expoId: string,
    participationType: ParticipationType,
    sessionId: string | undefined,
  ): Promise<MySurveyAnswerResponseDto> {
    const phoneNumber = await this.resolveSessionPhone(expoId, sessionId);

    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      participationType,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    const latest = await this.submissionStore.findLatestByKey(
      survey.id,
      phoneNumber,
    );
    if (!latest) {
      return { answered: false, status: null };
    }

    switch (latest.status) {
      case SurveyAnswerSubmissionStatus.REJECTED: {
        return { answered: false, status: latest.status };
      }

      case SurveyAnswerSubmissionStatus.STORED: {
        return { answered: true, status: latest.status };
      }

      case SurveyAnswerSubmissionStatus.RECEIVED:
      case SurveyAnswerSubmissionStatus.PUBLISHED: {
        return {
          answered: true,
          status: SurveyAnswerSubmissionStatus.RECEIVED,
        };
      }
    }
  }

  /** 세션 확인을 가장 먼저 해서 인증되지 않은 요청은 다른 결과 없이 401만 받는다. */
  private async resolveSessionPhone(
    expoId: string,
    sessionId: string | undefined,
  ): Promise<string> {
    if (sessionId === undefined) {
      throw new ParticipantSessionException();
    }

    return normalizePhoneNumber(
      await this.userClient.resolveParticipantSession({ expoId, sessionId }),
    );
  }
}
