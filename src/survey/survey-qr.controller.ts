import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { qrTokenSchema } from './dto/qr-token.schema.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { SurveyQrService } from './survey-qr.service.js';

/** 현장 종이 QR 설문 HTTP 엔트리포인트 — 응답자의 설문 조회와 익명 답변 제출. */
@ApiTags('survey-qr')
@Controller('surveys')
export class SurveyQrController {
  constructor(private readonly surveyQrService: SurveyQrService) {}

  /** QR로 들어온 응답자에게 보여 줄 설문을 조회한다. 이미 쓴 QR이면 409. */
  @ApiOperation({
    summary: '현장 QR 설문 조회',
    description:
      '참여 서비스에서 입장이 확인된 토큰으로 설문(문항 포함)을 조회한다. 이미 응답한 토큰은 설문을 채우기 전에 막는다.',
  })
  @ApiOkResponse({ type: SurveyResponseDto })
  @ApiErrorResponse(
    404,
    '없거나 입장하지 않은 토큰이거나 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @ApiErrorResponse(409, '이미 응답한 토큰 (SURVEY_ANSWER_ALREADY_EXISTS)')
  @ApiErrorResponse(
    503,
    '참여 서비스에서 토큰의 입장 여부를 확인하지 못함 — 잠시 후 재시도 (EXTERNAL_SERVICE_UNAVAILABLE)',
  )
  @Get('qr/:token')
  async findSurvey(
    @Param('token', new ZodValidationPipe(qrTokenSchema)) token: string,
  ): Promise<SurveyResponseDto> {
    return this.surveyQrService.findSurvey(token);
  }

  /** QR 토큰으로 익명 답변을 제출한다. 토큰당 1회만 가능하다. */
  @ApiOperation({
    summary: '현장 QR 설문 답변 제출',
    description:
      '익명 답변을 문항 스펙으로 검증해 저장한다. 토큰당 한 번만 가능하다.',
  })
  @ApiNoContentResponse({ description: '저장 완료' })
  @ApiErrorResponse(400, '답변이 문항 스펙과 맞지 않음 (SURVEY_ANSWER_INVALID)')
  @ApiErrorResponse(
    404,
    '없거나 입장하지 않은 토큰이거나 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @ApiErrorResponse(409, '이미 응답한 토큰 (SURVEY_ANSWER_ALREADY_EXISTS)')
  @ApiErrorResponse(
    503,
    '참여 서비스에서 토큰의 입장 여부를 확인하지 못함 — 잠시 후 재시도 (EXTERNAL_SERVICE_UNAVAILABLE)',
  )
  @Post('answer/qr/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async submit(
    @Param('token', new ZodValidationPipe(qrTokenSchema)) token: string,
    @Body() dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    return this.surveyQrService.submit(token, dto);
  }
}
