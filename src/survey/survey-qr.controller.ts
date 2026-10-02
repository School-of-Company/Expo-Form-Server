import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IssueSurveyQrTokensRequestDto } from './dto/issue-survey-qr-tokens.request.dto.js';
import { IssueSurveyQrTokensResponseDto } from './dto/issue-survey-qr-tokens.response.dto.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { SurveyQrService } from './survey-qr.service.js';

/** 현장 종이 QR 설문 HTTP 엔트리포인트 — 토큰 발급(어드민)과 조회·제출(응답자). */
@Controller('surveys')
export class SurveyQrController {
  constructor(private readonly surveyQrService: SurveyQrService) {}

  /** 일반 참가자 설문용 종이 QR 토큰을 발급한다. */
  @Post(':expoId/qr-tokens')
  issueTokens(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: IssueSurveyQrTokensRequestDto,
  ): Promise<IssueSurveyQrTokensResponseDto> {
    return this.surveyQrService.issueTokens(expoId, dto);
  }

  /** QR로 들어온 응답자에게 보여 줄 설문을 조회한다. 이미 쓴 QR이면 409. */
  @Get('qr/:token')
  findSurvey(@Param('token') token: string): Promise<SurveyResponseDto> {
    return this.surveyQrService.findSurvey(token);
  }

  /** QR 토큰으로 익명 답변을 제출한다. 토큰당 1회만 가능하다. */
  @Post('answer/qr/:token')
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    return this.surveyQrService.submit(token, dto);
  }
}
