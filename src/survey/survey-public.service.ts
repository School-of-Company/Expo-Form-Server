import { Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { isForeignKeyViolation } from '../common/exceptions/postgres-error.util.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import { SubmitPublicSurveyAnswerRequestDto } from './dto/submit-public-survey-answer.request.dto.js';
import {
  PublicSurveyResponseDto,
  toPublicSurveyResponse,
} from './dto/public-survey.response.dto.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { normalizeLotteryPhone } from './lottery-phone.js';
import { SurveyQrAnswerStore } from './survey-qr-answer.store.js';
import { SurveyStore } from './survey.store.js';

/**
 * 공개 설문 링크를 담당한다. 대상은 박람회 일반 참가자 설문 하나뿐이다.
 *
 * 입장 QR과 무관하게 `expoId`만으로 누구나(동행자 포함) 응답한다. 응답자를 식별하지 않아서 같은 사람이
 * 여러 번 응답해도 막지 않고, 답변을 이 서비스가 직접 저장한다 — 유저 서비스로 보내지 않는다.
 */
@Injectable()
export class SurveyPublicService {
  private readonly logger = new Logger(SurveyPublicService.name);

  constructor(
    private readonly surveyStore: SurveyStore,
    private readonly qrAnswerStore: SurveyQrAnswerStore,
  ) {}

  /**
   * 응답자에게 보여 줄 설문을 조회한다.
   *
   * @throws {SurveyNotFoundException} 그 박람회에 일반 참가자 설문이 없을 때
   */
  async findSurvey(expoId: string): Promise<PublicSurveyResponseDto> {
    return toPublicSurveyResponse(await this.findPublicSurvey(expoId));
  }

  /**
   * 답변을 문항 스펙으로 검증해 저장한다.
   *
   * @throws {SurveyNotFoundException} 그 박람회에 일반 참가자 설문이 없을 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙과 맞지 않거나, 경품 번호의 형식이 틀리거나
   *   개인정보 수집 동의 없이 번호를 보냈을 때
   */
  async submit(
    expoId: string,
    dto: SubmitPublicSurveyAnswerRequestDto,
  ): Promise<void> {
    const survey = await this.findPublicSurvey(expoId);

    const schema = buildAnswerSchema(survey.dynamicSurveys);
    const result = schema.safeParse(dto.answers);
    if (!result.success) {
      throw new SurveyAnswerInvalidException(result.error.message);
    }

    const lotteryPhoneNumber = this.resolveLotteryPhone(survey, dto);

    try {
      await this.qrAnswerStore.create(
        survey.id,
        result.data,
        dto.occupation,
        lotteryPhoneNumber,
      );
    } catch (error) {
      // 설문을 확인한 뒤 저장하기 전에 박람회 삭제로 설문이 지워진 경우다.
      if (isForeignKeyViolation(error)) {
        throw new SurveyNotFoundException();
      }

      throw error;
    }

    this.logger.log(`공개 설문 답변 저장 완료: surveyId=${survey.id}`);
  }

  /**
   * 경품 추첨에 쓸 번호를 정한다. 추첨이 꺼져 있거나 번호를 보내지 않았으면 `null`이다 — 꺼진 설문에 보낸
   * 번호는 저장하지 않고 응답만 받는다. 번호가 있으면 개인정보 수집 동의가 있어야 하고 문자를 보낼 수 있는
   * 모양이어야 한다. 번호는 개인정보라 오류 메시지와 로그에 담지 않는다.
   */
  private resolveLotteryPhone(
    survey: SurveyEntity,
    dto: SubmitPublicSurveyAnswerRequestDto,
  ): string | null {
    const raw = dto.phoneNumber?.trim();
    if (raw === undefined || raw === '' || !survey.lotteryEnabled) {
      return null;
    }

    if (dto.personalInformationStatus !== true) {
      throw new SurveyAnswerInvalidException(
        '경품 번호를 받으려면 개인정보 수집 동의가 필요합니다.',
      );
    }

    const phoneNumber = normalizeLotteryPhone(raw);
    if (phoneNumber === null) {
      throw new SurveyAnswerInvalidException(
        '전화번호 형식이 올바르지 않습니다.',
      );
    }

    return phoneNumber;
  }

  private async findPublicSurvey(expoId: string): Promise<SurveyEntity> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      ParticipationType.STANDARD,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    return survey;
  }
}
