import { Inject, Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ParticipantNotFoundException,
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { normalizePhoneNumber } from '../common/phone-number.util.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import {
  DuplicateSurveyAnswerError,
  USER_CLIENT,
  type UserClient,
} from '../user-client/user-client.interface.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import { SurveyStore } from './survey.store.js';

/**
 * 설문 답변 제출을 담당한다.
 *
 * 답변 데이터 자체는 이 저장소에 저장하지 않는다(2026-09-25 확정) — 여기서는 저장된 문항
 * 스펙으로 제출값을 검증만 하고, 실제 저장은 유저 서비스에 위임한다. 그래서 이 서비스가
 * 갖고 있는 건 검증 로직과 `totalAnswers` 집계뿐이다.
 */
@Injectable()
export class SurveyAnswerService {
  private readonly logger = new Logger(SurveyAnswerService.name);

  constructor(
    private readonly surveyStore: SurveyStore,
    @Inject(USER_CLIENT) private readonly userClient: UserClient,
  ) {}

  /**
   * 전화번호로 응답자를 확인하고, 저장된 문항 스펙으로 답변을 검증한 뒤 유저 서비스에
   * 위임한다. 성공하면 설문의 누적 응답 수를 늘린다.
   *
   * 대상 설문은 (박람회, 참여자군) 조합으로 식별한다 — standard/trainee 제출 라우트가
   * 각각 자신의 참여자군을 고정해서 넘긴다.
   *
   * @throws {SurveyNotFoundException} 해당 조합의 설문이 없을 때
   * @throws {ParticipantNotFoundException} 전화번호로 응답자를 찾을 수 없거나, 찾았지만
   *   참여자군이 이 설문의 대상과 다를 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙(필수 여부·선택지·최대 선택 개수)과
   *   맞지 않을 때
   * @throws {SurveyAnswerAlreadyExistsException} 같은 응답자가 이미 제출한 적 있을 때
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

    const participant = await this.userClient.findByPhoneNumber(
      survey.expoId,
      normalizePhoneNumber(dto.phoneNumber),
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

    try {
      await this.userClient.submitSurveyAnswer({
        surveyId: survey.id,
        userId: participant.userId,
        answers: result.data,
        personalInformationStatus: dto.personalInformationStatus,
      });
    } catch (err) {
      if (err instanceof DuplicateSurveyAnswerError) {
        throw new SurveyAnswerAlreadyExistsException();
      }
      throw err;
    }

    await this.surveyStore.incrementTotalAnswers(survey.id);
    this.logger.log(`설문 답변 제출 완료: surveyId=${survey.id}`);
  }

  /**
   * 종이 QR로 들어온 익명 답변을 검증해 이 서비스에 직접 저장한다. 묶을 응답자가 없어서
   * 유저 서비스로 보내지 않는다 — "답변은 유저 서비스가 저장" 원칙의 유일한 예외다.
   *
   * @throws {SurveyNotFoundException} 없는 토큰일 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙과 맞지 않을 때
   * @throws {SurveyAnswerAlreadyExistsException} 이미 응답한 토큰일 때
   */
  async submitQr(
    token: string,
    dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    const qrToken = await this.surveyStore.findQrToken(token);
    if (!qrToken) throw new SurveyNotFoundException();

    const schema = buildAnswerSchema(qrToken.survey.dynamicSurveys);
    const result = schema.safeParse(dto.answers);
    if (!result.success) {
      throw new SurveyAnswerInvalidException(result.error.message);
    }

    const submitted = await this.surveyStore.submitQrAnswer(
      token,
      qrToken.survey.id,
      result.data,
    );
    if (!submitted) throw new SurveyAnswerAlreadyExistsException();
    this.logger.log(`QR 설문 답변 저장 완료: surveyId=${qrToken.survey.id}`);
  }
}
