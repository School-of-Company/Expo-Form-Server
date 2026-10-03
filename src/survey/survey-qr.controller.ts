import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { SurveyQrService } from './survey-qr.service.js';

/** 현장 종이 QR 설문 HTTP 엔트리포인트 — 응답자의 설문 조회와 익명 답변 제출. */
@Controller('surveys')
export class SurveyQrController {
  constructor(private readonly surveyQrService: SurveyQrService) {}

  /** QR로 들어온 응답자에게 보여 줄 설문을 조회한다. 이미 쓴 QR이면 409. */
  @Get('qr/:token')
  findSurvey(@Param('token') token: string): Promise<SurveyResponseDto> {
    return this.surveyQrService.findSurvey(token);
  }

  /** QR 토큰으로 익명 답변을 제출한다. 토큰당 1회만 가능하다. */
  @Post('answer/qr/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    return this.surveyQrService.submit(token, dto);
  }
}
