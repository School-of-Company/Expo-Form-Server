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
import { PublicSurveyResponseDto } from './dto/public-survey.response.dto.js';
import { SubmitPublicSurveyAnswerRequestDto } from './dto/submit-public-survey-answer.request.dto.js';
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
      '박람회 일반 참가자 설문(문항 포함)을 입장 확인 없이 조회한다. 응답자를 식별하지 않는다. `lotteryEnabled`가 true일 때만 경품 번호 입력을 보여 준다.',
  })
  @ApiOkResponse({ type: PublicSurveyResponseDto })
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Get('public/:expoId')
  async findSurvey(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<PublicSurveyResponseDto> {
    return this.surveyPublicService.findSurvey(expoId);
  }

  /** 공개 링크로 익명 답변을 제출한다. 중복 응답을 막지 않는다. */
  @ApiOperation({
    summary: '공개 설문 답변 제출',
    description:
      '익명 답변을 문항 스펙으로 검증해 저장한다. 응답자를 식별하지 않아 같은 사람이 여러 번 응답할 수 있다. 경품 추첨이 켜져 있으면 선택으로 `phoneNumber`와 개인정보 수집 동의(`personalInformationStatus`)를 함께 받는다.',
  })
  @ApiNoContentResponse({ description: '저장 완료' })
  @ApiErrorResponse(
    400,
    '답변이 문항 스펙과 맞지 않거나 경품 번호 형식이 틀리거나 동의 없이 번호를 보냄 (SURVEY_ANSWER_INVALID)',
  )
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Post('answer/public/:expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async submit(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: SubmitPublicSurveyAnswerRequestDto,
  ): Promise<void> {
    return this.surveyPublicService.submit(expoId, dto);
  }
}
