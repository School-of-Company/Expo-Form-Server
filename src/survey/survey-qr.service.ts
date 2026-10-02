import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import { IssueSurveyQrTokensRequestDto } from './dto/issue-survey-qr-tokens.request.dto.js';
import { IssueSurveyQrTokensResponseDto } from './dto/issue-survey-qr-tokens.response.dto.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import {
  SurveyResponseDto,
  toSurveyResponse,
} from './dto/survey.response.dto.js';
import { SurveyStore } from './survey.store.js';

/**
 * 현장 종이 QR 설문을 담당한다. 대상은 박람회 일반 참가자 설문 하나뿐이다.
 *
 * 응답자 정보가 없는 익명 응답이라, 추측할 수 없는 토큰 자체가 "이 종이를 받았다"는 증명이
 * 된다. 묶을 응답자가 없으므로 답변은 유저 서비스로 보내지 않고 여기 직접 저장한다 —
 * "답변은 유저 서비스가 저장" 원칙의 유일한 예외다.
 */
@Injectable()
export class SurveyQrService {
  private readonly logger = new Logger(SurveyQrService.name);

  constructor(private readonly surveyStore: SurveyStore) {}

  /**
   * 인쇄할 QR 토큰을 발급한다. 순번처럼 예측할 수 있는 값을 쓰면 남의 QR로 대신 응답할 수
   * 있어서 128bit 난수를 쓴다.
   *
   * @throws {SurveyNotFoundException} 해당 박람회에 일반 참가자 설문이 없을 때
   */
  async issueTokens(
    expoId: string,
    dto: IssueSurveyQrTokensRequestDto,
  ): Promise<IssueSurveyQrTokensResponseDto> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      ParticipationType.STANDARD,
    );
    if (!survey) throw new SurveyNotFoundException();

    const tokens = Array.from({ length: dto.count }, () =>
      randomBytes(16).toString('base64url'),
    );
    await this.surveyStore.saveQrTokens(survey.id, tokens);
    this.logger.log(
      `QR 토큰 발급 완료: surveyId=${survey.id}, ${tokens.length}개`,
    );

    return { tokens };
  }

  /**
   * QR을 찍은 응답자에게 보여 줄 설문을 조회한다. 이미 쓴 QR은 설문을 채우기 전에 막는다.
   *
   * @throws {SurveyNotFoundException} 없는 토큰일 때
   * @throws {SurveyAnswerAlreadyExistsException} 이미 응답한 토큰일 때
   */
  async findSurvey(token: string): Promise<SurveyResponseDto> {
    const qrToken = await this.surveyStore.findQrToken(token);
    if (!qrToken) throw new SurveyNotFoundException();
    if (qrToken.submittedAt) throw new SurveyAnswerAlreadyExistsException();

    return toSurveyResponse(qrToken.survey);
  }

  /**
   * 답변을 문항 스펙으로 검증해 토큰에 기록한다. 이미 썼는지는 미리 확인하지 않고
   * 조건부 갱신 결과로 판정한다 — 동시에 들어온 두 제출 중 하나만 통과시키기 위해서다.
   *
   * @throws {SurveyNotFoundException} 없는 토큰일 때
   * @throws {SurveyAnswerInvalidException} 답변이 문항 스펙과 맞지 않을 때
   * @throws {SurveyAnswerAlreadyExistsException} 이미 응답한 토큰일 때
   */
  async submit(
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
