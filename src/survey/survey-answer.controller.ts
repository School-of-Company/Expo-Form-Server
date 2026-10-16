import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyAnswerService } from './survey-answer.service.js';

/** 유저 서비스가 SMS 인증 뒤 발급하는 참가자 세션 쿠키의 기본 이름. 신청 서비스와 같은 설정 키로 바꾼다. */
const DEFAULT_SESSION_COOKIE_NAME = 'PARTICIPANT_SESSION';

/**
 * `Cookie` 헤더에서 참가자 세션 값을 꺼낸다. 신청 서비스처럼 같은 이름이 정확히 하나이고 비어 있지
 * 않을 때만 인정한다 — 여러 개면 어느 것이 진짜인지 알 수 없다.
 */
export function readSessionCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  const values = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return values.length === 1 && values[0] !== '' ? values[0] : undefined;
}

/**
 * `/surveys/answer` HTTP 엔트리포인트 — 응답자의 답변 제출 전용.
 *
 * Gateway 공개 경로라 JWT가 없다. 대신 참가자 세션 쿠키를 유저 서비스 내부 API로 확인한다(#147).
 */
@ApiTags('survey-answers')
@ApiCookieAuth(DEFAULT_SESSION_COOKIE_NAME)
@Controller('surveys/answer')
export class SurveyAnswerController {
  private readonly sessionCookieName: string;

  constructor(
    private readonly surveyAnswerService: SurveyAnswerService,
    config: ConfigService,
  ) {
    const name = config.get<string>('PARTICIPANT_SESSION_COOKIE_NAME');
    this.sessionCookieName =
      name === undefined || name === '' ? DEFAULT_SESSION_COOKIE_NAME : name;
  }

  /**
   * 일반 참가자 설문에 답변을 제출한다. 참가자 세션으로 응답자를 확인하고, 문항 스펙으로
   * 답변을 검증한 뒤 접수 기록을 남긴다. 실제 저장은 비동기로 처리되므로 202로 응답한다 —
   * 이 시점엔 아직 유저 서비스에 저장되지 않았을 수 있다.
   */
  @ApiOperation({
    summary: '일반 참가자 설문 답변 제출',
    description:
      '참가자 세션(PARTICIPANT_SESSION 쿠키)으로 응답자를 확인하고 문항 스펙으로 답변을 검증한 뒤 접수 기록을 남긴다. 저장은 비동기라 202로 응답한다.',
  })
  @ApiAcceptedResponse({ description: '접수 완료 (저장은 비동기로 처리됨)' })
  @ApiErrorResponse(400, '답변이 문항 스펙과 맞지 않음 (SURVEY_ANSWER_INVALID)')
  @ApiErrorResponse(
    401,
    '참가자 세션이 없거나 다른 행사의 것이거나 만료됨 (SESSION_REQUIRED, SESSION_EXPIRED)',
  )
  @ApiErrorResponse(
    404,
    '설문이 없거나, 세션의 전화번호로 등록된 참가자를 찾을 수 없음 (SURVEY_NOT_FOUND, PARTICIPANT_NOT_FOUND)',
  )
  @ApiErrorResponse(
    409,
    '이미 제출한 응답자, 또는 전화번호로 응답자를 하나로 특정할 수 없음 (SURVEY_ANSWER_ALREADY_EXISTS, PARTICIPANT_AMBIGUOUS)',
  )
  @ApiErrorResponse(
    503,
    '유저 서비스에서 응답자를 확인하지 못함 — 잠시 후 재시도 (EXTERNAL_SERVICE_UNAVAILABLE)',
  )
  @Post('standard/:expoId')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitStandard(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitSurveyAnswerRequestDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.surveyAnswerService.submit(
      expoId,
      ParticipationType.STANDARD,
      readSessionCookie(request.headers.cookie, this.sessionCookieName),
      dto,
    );
  }

  /** 교원연수자 설문에 답변을 제출한다. 검증·접수 과정은 일반 참가자와 같다. */
  @ApiOperation({
    summary: '교원연수자 설문 답변 제출',
    description: '검증·접수 과정은 일반 참가자와 같다.',
  })
  @ApiAcceptedResponse({ description: '접수 완료 (저장은 비동기로 처리됨)' })
  @ApiErrorResponse(400, '답변이 문항 스펙과 맞지 않음 (SURVEY_ANSWER_INVALID)')
  @ApiErrorResponse(
    401,
    '참가자 세션이 없거나 다른 행사의 것이거나 만료됨 (SESSION_REQUIRED, SESSION_EXPIRED)',
  )
  @ApiErrorResponse(
    404,
    '설문이 없거나, 세션의 전화번호로 등록된 참가자를 찾을 수 없음 (SURVEY_NOT_FOUND, PARTICIPANT_NOT_FOUND)',
  )
  @ApiErrorResponse(
    409,
    '이미 제출한 응답자, 또는 전화번호로 응답자를 하나로 특정할 수 없음 (SURVEY_ANSWER_ALREADY_EXISTS, PARTICIPANT_AMBIGUOUS)',
  )
  @ApiErrorResponse(
    503,
    '유저 서비스에서 응답자를 확인하지 못함 — 잠시 후 재시도 (EXTERNAL_SERVICE_UNAVAILABLE)',
  )
  @Post('trainee/:expoId')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitTrainee(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitSurveyAnswerRequestDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.surveyAnswerService.submit(
      expoId,
      ParticipationType.TRAINEE,
      readSessionCookie(request.headers.cookie, this.sessionCookieName),
      dto,
    );
  }
}
