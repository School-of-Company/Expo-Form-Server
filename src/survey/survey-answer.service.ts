import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ParticipantNotFoundException,
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
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
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
   * 전화번호로 응답자를 확인하고, 저장된 문항 스펙으로 답변을 검증한 뒤 접수 기록을 남긴다.
   * 접수 시점에 설문의 누적 응답 수를 늘린다 — 유저 서비스가 나중에 거절하면
   * {@link SurveyAnswerResultConsumer}가 되돌린다.
   *
   * 대상 설문은 (박람회, 참여자군) 조합으로 식별한다 — standard/trainee 제출 라우트가
   * 각각 자신의 참여자군을 고정해서 넘긴다.
   *
   * @throws {SurveyNotFoundException} 해당 조합의 설문이 없을 때
   * @throws {ParticipantNotFoundException} 전화번호로 응답자를 찾을 수 없거나, 찾았지만
   *   참여자군이 이 설문의 대상과 다를 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙(필수 여부·선택지·최대 선택 개수)과
   *   맞지 않을 때
   * @throws {SurveyAnswerAlreadyExistsException} 같은 응답자의 활성(= 거절되지 않은) 제출
   *   기록이 이미 있을 때
   */
  async submit(
    expoId: string,
    participationType: ParticipationType,
    dto: SubmitSurveyAnswerRequestDto,
  ): Promise<void> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      participationType,
    );
    if (!survey) throw new SurveyNotFoundException();

    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);

    const participant = await this.userClient.findByPhoneNumber(
      survey.expoId,
      phoneNumber,
    );
    // 등록되지 않은 경우와 참여자군이 안 맞는 경우를 같은 예외로 묶는다 — 둘을 구분해서
    // 알려주면 그 전화번호의 등록 여부 자체가 노출된다.
    if (
      !participant ||
      participant.participationType !== survey.participationType
    ) {
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
    if (existing) throw new SurveyAnswerAlreadyExistsException();

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
      payload: {
        answers: result.data,
        personalInformationStatus: dto.personalInformationStatus,
      },
    } satisfies SubmissionFields);

    // 위 findActiveByKey와 이 저장 사이에 같은 응답자의 다른 요청이 끼어들면 둘 다 통과한다.
    // 그럴 땐 활성 제출 유니크 제약이 한쪽을 막는데, 그 위반을 그대로 두면 409가 아니라 500이
    // 나간다 — 여기서 잡아 도메인 예외로 바꾼다.
    try {
      await this.submissionStore.createReceived(submission);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new SurveyAnswerAlreadyExistsException();
      throw err;
    }
    this.logger.log(
      `설문 답변 접수 완료: surveyId=${survey.id}, eventId=${submission.eventId}`,
    );
  }
}
