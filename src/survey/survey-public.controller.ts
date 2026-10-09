import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { SubmitSurveyQrAnswerRequestDto } from './dto/submit-survey-qr-answer.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { SurveyPublicService } from './survey-public.service.js';

/** 공개 설문 링크 HTTP 엔트리포인트 — 응답자의 설문 조회와 익명 답변 제출. */
@ApiTags('survey-public')
@Controller('surveys')
export class SurveyPublicController {
  constructor(private readonly surveyPublicService: SurveyPublicService) {}

  /** 공개 링크로 들어온 응답자에게 보여 줄 설문을 조회한다. */
  @ApiOperation({
    summary: '공개 설문 조회',
    description:
      '박람회 일반 참가자 설문(문항 포함)을 입장 확인 없이 조회한다. 응답자를 식별하지 않는다.',
  })
  @ApiOkResponse({ type: SurveyResponseDto })
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Get('public/:expoId')
  async findSurvey(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<SurveyResponseDto> {
    return this.surveyPublicService.findSurvey(expoId);
  }

  /** 공개 링크로 익명 답변을 제출한다. 중복 응답을 막지 않는다. */
  @ApiOperation({
    summary: '공개 설문 답변 제출',
    description:
      '익명 답변을 문항 스펙으로 검증해 저장한다. 응답자를 식별하지 않아 같은 사람이 여러 번 응답할 수 있다.',
  })
  @ApiNoContentResponse({ description: '저장 완료' })
  @ApiErrorResponse(400, '답변이 문항 스펙과 맞지 않음 (SURVEY_ANSWER_INVALID)')
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Post('answer/public/:expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async submit(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitSurveyQrAnswerRequestDto,
  ): Promise<void> {
    return this.surveyPublicService.submit(expoId, dto);
  }
}
