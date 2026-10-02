import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import { SurveyAnswerService } from './survey-answer.service.js';

/** `/surveys/answer` HTTP 엔트리포인트 — 응답자의 답변 제출 전용. */
@Controller('surveys/answer')
export class SurveyAnswerController {
  constructor(private readonly surveyAnswerService: SurveyAnswerService) {}

  /**
   * 일반 참가자 설문에 답변을 제출한다. 전화번호로 응답자를 확인하고, 문항 스펙으로
   * 답변을 검증한 뒤 유저 서비스에 저장을 위임한다.
   */
  @Post('standard/:expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  submitStandard(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitSurveyAnswerRequestDto,
  ): Promise<void> {
    return this.surveyAnswerService.submit(
      expoId,
      ParticipationType.STANDARD,
      dto,
    );
  }

  /** 종이 QR 토큰으로 일반 참가자 설문에 익명 답변을 제출한다. 토큰당 1회만 가능하다. */
  @Post('qr/:token')
  submitQr(
    @Param('token') token: string,
    @Body() dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    return this.surveyAnswerService.submitQr(token, dto);
  }

  /** 교원연수자 설문에 답변을 제출한다. 검증·위임 과정은 일반 참가자와 같다. */
  @Post('trainee/:expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  submitTrainee(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitSurveyAnswerRequestDto,
  ): Promise<void> {
    return this.surveyAnswerService.submit(
      expoId,
      ParticipationType.TRAINEE,
      dto,
    );
  }
}
