import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyAnswerService } from './survey-answer.service.js';

/** `/surveys/answer` HTTP 엔트리포인트 — 응답자의 답변 제출 전용. */
@ApiTags('survey-answers')
@Controller('surveys/answer')
export class SurveyAnswerController {
  constructor(private readonly surveyAnswerService: SurveyAnswerService) {}

  /**
   * 일반 참가자 설문에 답변을 제출한다. 전화번호로 응답자를 확인하고, 문항 스펙으로
   * 답변을 검증한 뒤 접수 기록을 남긴다. 실제 저장은 비동기로 처리되므로 202로 응답한다 —
   * 이 시점엔 아직 유저 서비스에 저장되지 않았을 수 있다.
   */
  @ApiOperation({
    summary: '일반 참가자 설문 답변 제출',
    description:
      '전화번호로 응답자를 확인하고 문항 스펙으로 답변을 검증한 뒤 접수 기록을 남긴다. 저장은 비동기라 202로 응답한다.',
  })
  @ApiAcceptedResponse({ description: '접수 완료 (저장은 비동기로 처리됨)' })
  @ApiErrorResponse(400, '답변이 문항 스펙과 맞지 않음 (SURVEY_ANSWER_INVALID)')
  @ApiErrorResponse(
    404,
    '설문이 없거나, 전화번호로 등록된 참가자를 찾을 수 없음 (SURVEY_NOT_FOUND, PARTICIPANT_NOT_FOUND)',
  )
  @ApiErrorResponse(409, '이미 제출한 응답자 (SURVEY_ANSWER_ALREADY_EXISTS)')
  @Post('standard/:expoId')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitStandard(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitSurveyAnswerRequestDto,
  ): Promise<void> {
    return this.surveyAnswerService.submit(
      expoId,
      ParticipationType.STANDARD,
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
    404,
    '설문이 없거나, 전화번호로 등록된 참가자를 찾을 수 없음 (SURVEY_NOT_FOUND, PARTICIPANT_NOT_FOUND)',
  )
  @ApiErrorResponse(409, '이미 제출한 응답자 (SURVEY_ANSWER_ALREADY_EXISTS)')
  @Post('trainee/:expoId')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitTrainee(
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
