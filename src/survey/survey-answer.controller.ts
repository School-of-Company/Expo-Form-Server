import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyAnswerService } from './survey-answer.service.js';

/** `/v1/surveys/:surveyId/answers` HTTP 엔트리포인트 — 응답자의 답변 제출 전용. */
@Controller('v1/surveys/:surveyId/answers')
export class SurveyAnswerController {
  constructor(private readonly surveyAnswerService: SurveyAnswerService) {}

  /**
   * 설문에 답변을 제출한다. 전화번호로 응답자를 확인하고, 문항 스펙으로 답변을 검증한 뒤
   * 유저 서비스에 저장을 위임한다.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  submit(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @Body() dto: SubmitSurveyAnswerRequestDto,
  ): Promise<void> {
    return this.surveyAnswerService.submit(surveyId, dto);
  }
}
