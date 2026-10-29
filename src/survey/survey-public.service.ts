import { Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { isForeignKeyViolation } from '../common/exceptions/postgres-error.util.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import { FindPublicSurveyAnswersRequestDto } from './dto/find-public-survey-answers.request.dto.js';
import { PublicSurveyAnswerPageResponseDto } from './dto/public-survey-answer-page.response.dto.js';
import { PublicSurveyAnswerResponseDto } from './dto/public-survey-answer.response.dto.js';
import { SubmitPublicSurveyAnswerRequestDto } from './dto/submit-public-survey-answer.request.dto.js';
import {
  PublicSurveyResponseDto,
  toPublicSurveyResponse,
} from './dto/public-survey.response.dto.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { normalizeLotteryPhone } from './lottery-phone.js';
import { generateGiftToken, hashGiftToken } from './gift-secret.js';
import { decodeCursor, encodeCursor } from './public-answer-cursor.js';
import {
  SurveyPublicAnswerStore,
  type DrawOutcome,
} from './survey-public-answer.store.js';
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
    private readonly answerStore: SurveyPublicAnswerStore,
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
  ): Promise<PublicSurveyAnswerResponseDto> {
    const survey = await this.findPublicSurvey(expoId);

    const schema = buildAnswerSchema(survey.dynamicSurveys);
    const result = schema.safeParse(dto.answers);
    if (!result.success) {
      throw new SurveyAnswerInvalidException(result.error.message);
    }

    const lotteryPhoneNumber = this.resolveLotteryPhone(survey, dto);

    const giftToken = generateGiftToken();
    let outcome: DrawOutcome;
    try {
      outcome = await this.answerStore.create(
        survey.id,
        result.data,
        dto.occupation,
        lotteryPhoneNumber,
        hashGiftToken(giftToken),
      );
    } catch (error) {
      // 설문을 확인한 뒤 저장하기 전에 박람회 삭제로 설문이 지워진 경우다.
      if (isForeignKeyViolation(error)) {
        throw new SurveyNotFoundException();
      }

      throw error;
    }

    this.logger.log(`공개 설문 답변 저장 완료: surveyId=${survey.id}`);

    return { won: outcome.won, giftToken };
  }

  /**
   * 리포트 서비스가 익명 응답을 끝까지 읽도록 한 페이지를 준다(#215). 첫 페이지에서 정한 상한을 커서로 넘겨
   * 모든 페이지가 같은 응답 집합을 나눠 읽는다. 문항은 지금 정의를 싣는다 — 응답이 있으면 문항을 바꿀 수 없다(#179).
   *
   * @throws {SurveyNotFoundException} 그 박람회에 일반 참가자 설문이 없을 때
   * @throws {SurveyCursorInvalidException} 커서가 올바르지 않거나 이 설문의 것이 아닐 때
   */
  async findAnswerPage(
    expoId: string,
    dto: FindPublicSurveyAnswersRequestDto,
  ): Promise<PublicSurveyAnswerPageResponseDto> {
    const survey = await this.findPublicSurvey(expoId);
    const cursor =
      dto.cursor === undefined ? null : decodeCursor(dto.cursor, survey.id);
    const snapshotAt =
      cursor?.snapshotAt ?? (await this.answerStore.snapshot(survey.id));

    const page = await this.answerStore.findPage(
      survey.id,
      snapshotAt,
      cursor,
      dto.limit,
    );
    const rows = page.rows.slice(0, dto.limit);
    const last = rows.at(-1);

    return {
      survey: { id: survey.id, expoId: survey.expoId, title: survey.title },
      questionDefinition: 'CURRENT',
      questions: survey.dynamicSurveys.map((question, order) => ({
        id: question.id,
        order,
        title: question.title,
        formType: question.formType,
        requiredStatus: question.requiredStatus,
        jsonData: question.jsonData,
        otherJson: question.otherJson,
      })),
      snapshotAt,
      totalCount: page.totalCount,
      answers: rows,
      nextCursor:
        last && page.rows.length > dto.limit
          ? encodeCursor({
              surveyId: survey.id,
              snapshotAt,
              createdAt: last.createdAt,
              id: last.id,
              totalCount: page.totalCount,
            })
          : null,
    };
  }

  /**
   * 당첨됐을 때 문자를 보낼 번호를 정한다. 추첨이 꺼져 있거나 번호를 보내지 않았으면 `null`이다 — 꺼진 설문에
   * 보낸 번호는 저장하지 않고 응답만 받고, 번호가 없어도 응답과 추첨에는 영향이 없다. 번호가 있으면 개인정보 수집 동의가 있어야 하고 문자를 보낼 수 있는
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
