import { Inject, Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/exceptions/postgres-error.util.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import {
  PARTICIPATION_CLIENT,
  type ParticipationClient,
} from '../participation-client/participation-client.interface.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import {
  SurveyResponseDto,
  toSurveyResponse,
} from './dto/survey.response.dto.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyQrAnswerStore } from './survey-qr-answer.store.js';
import { SurveyStore } from './survey.store.js';

/**
 * 현장 종이 QR 설문을 담당한다. 대상은 박람회 일반 참가자 설문 하나뿐이다.
 *
 * 토큰은 참여 서비스가 발급하고 입구 스캔으로 입장을 기록한다 — 여기서는 토큰이 입장한 것인지
 * 참여 서비스에 확인하고(그때 박람회도 알려 받는다), 익명 답변을 직접 저장한다. 묶을 응답자가
 * 없어서 유저 서비스로 보내지 않는다 — "답변은 유저 서비스가 저장" 원칙의 유일한 예외다.
 */
@Injectable()
export class SurveyQrService {
  private readonly logger = new Logger(SurveyQrService.name);

  constructor(
    private readonly surveyStore: SurveyStore,
    private readonly qrAnswerStore: SurveyQrAnswerStore,
    @Inject(PARTICIPATION_CLIENT)
    private readonly participationClient: ParticipationClient,
  ) {}

  /**
   * QR을 찍은 응답자에게 보여 줄 설문을 조회한다. 이미 쓴 QR은 설문을 채우기 전에 막는다.
   *
   * @throws {SurveyNotFoundException} 없는 토큰이거나 입장하지 않은 토큰일 때, 또는 그
   *   박람회에 일반 참가자 설문이 없을 때
   * @throws {SurveyAnswerAlreadyExistsException} 이미 응답한 토큰일 때
   * @throws {ExternalServiceUnavailableException} 참여 서비스에서 입장 여부를 확인하지 못했을 때
   */
  async findSurvey(token: string): Promise<SurveyResponseDto> {
    const survey = await this.findSurveyByEnteredToken(token);
    if (await this.qrAnswerStore.existsByKey(survey.id, token)) {
      throw new SurveyAnswerAlreadyExistsException();
    }

    return toSurveyResponse(survey);
  }

  /**
   * 답변을 문항 스펙으로 검증해 저장한다. 이미 응답했는지는 미리 확인하지 않고 INSERT의
   * 유니크 위반으로 판정한다 — 동시에 들어온 두 제출 중 하나만 통과시키기 위해서다.
   *
   * @throws {SurveyNotFoundException} 없는 토큰이거나 입장하지 않은 토큰일 때, 또는 그
   *   박람회에 일반 참가자 설문이 없을 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙과 맞지 않을 때
   * @throws {SurveyAnswerAlreadyExistsException} 이미 응답한 토큰일 때
   * @throws {ExternalServiceUnavailableException} 참여 서비스에서 입장 여부를 확인하지 못했을 때
   */
  async submit(
    token: string,
    dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    const survey = await this.findSurveyByEnteredToken(token);

    const schema = buildAnswerSchema(survey.dynamicSurveys);
    const result = schema.safeParse(dto.answers);
    if (!result.success) {
      throw new SurveyAnswerInvalidException(result.error.message);
    }

    try {
      await this.qrAnswerStore.create(survey.id, token, result.data);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SurveyAnswerAlreadyExistsException();
      }

      // 설문을 확인한 뒤 저장하기 전에 박람회 삭제로 설문이 지워진 경우다.
      if (isForeignKeyViolation(error)) {
        throw new SurveyNotFoundException();
      }

      throw error;
    }

    this.logger.log(`QR 설문 답변 저장 완료: surveyId=${survey.id}`);
  }

  /** 참여 서비스에서 입장이 확인된 토큰의 박람회로 일반 참가자 설문을 찾는다. */
  private async findSurveyByEnteredToken(token: string): Promise<SurveyEntity> {
    const entered = await this.participationClient.findEnteredToken(token);
    if (!entered) {
      throw new SurveyNotFoundException();
    }

    const survey = await this.surveyStore.findByExpoAndType(
      entered.expoId,
      ParticipationType.STANDARD,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    return survey;
  }
}
