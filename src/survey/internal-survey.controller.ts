import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ExpoIdsRequestDto } from '../common/dto/expo-ids.request.dto.js';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { FindPublicSurveyAnswersRequestDto } from './dto/find-public-survey-answers.request.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { PublicSurveyAnswerPageResponseDto } from './dto/public-survey-answer-page.response.dto.js';
import { SurveySummaryDto } from './dto/survey-summary.response.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyService } from './survey.service.js';

/**
 * 다른 서비스가 부르는 `/internal/surveys` 엔트리포인트. Gateway를 거치지 않고 `X-Internal-Token`으로만
 * 인증한다({@link InternalTokenGuard}). v1에서 다른 도메인이 설문 저장소를 직접 읽던 자리를 대신한다.
 */
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal/surveys')
export class InternalSurveyController {
  constructor(
    private readonly surveyService: SurveyService,
    private readonly surveyPublicService: SurveyPublicService,
  ) {}

  /** 리포트 서비스 등이 설문 문항 스펙(엑셀 열 제목 등)을 읽을 때 쓴다. */
  @ApiOperation({
    summary: '설문 조회 (내부)',
    description:
      '(박람회, 참여자군)으로 설문 하나를 문항 스펙까지 담아 조회한다. 공개 조회와 같은 응답이다.',
  })
  @ApiOkResponse({ type: SurveyResponseDto })
  @ApiErrorResponse(404, '해당 설문이 없음 (SURVEY_NOT_FOUND)')
  @Get(':expoId')
  async findOne(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Query() dto: FindSurveyRequestDto,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.findOne(expoId, dto);
  }

  /** 리포트 서비스가 익명 공개 설문 응답 엑셀을 만들 때 끝까지 읽는다(#215). */
  @ApiOperation({
    summary: '공개 설문 응답 커서 조회 (내부)',
    description:
      '박람회 공개 설문(일반 참가자 설문 하나, 역할 공통)의 익명 응답을 제출 시각·응답 id 순서로 페이지씩 준다. 첫 페이지는 cursor 없이 부르고 nextCursor가 null일 때까지 그대로 넘긴다. 첫 페이지에서 고정한 snapshotAt까지만 읽어 그 사이 새 응답으로 빠지거나 겹치지 않고, 읽은 행 수의 합은 totalCount와 같다. questions는 현재 문항 정의다(questionDefinition=CURRENT, 응답이 있으면 문항 변경이 막힌다). 참가자 id·이름·입장 QR·경품 번호는 없다.',
  })
  @ApiOkResponse({ type: PublicSurveyAnswerPageResponseDto })
  @ApiErrorResponse(
    400,
    '커서가 올바르지 않거나 이 설문의 커서가 아님 (SURVEY_CURSOR_INVALID)',
  )
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Get(':expoId/public-answers')
  async findPublicAnswers(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Query() dto: FindPublicSurveyAnswersRequestDto,
  ): Promise<PublicSurveyAnswerPageResponseDto> {
    return this.surveyPublicService.findAnswerPage(expoId, dto);
  }

  /** 박람회 서비스가 박람회 목록에 "설문 만들었는지"를 표시할 때 쓴다(v1 `GetExpoValidationStatus`). */
  @ApiOperation({
    summary: '박람회별 설문 현황 (내부)',
    description:
      '여러 박람회에 만들어진 설문의 (박람회, 참여자군)을 돌려준다. 설문이 없는 박람회는 결과에 없다.',
  })
  @ApiOkResponse({ type: [SurveySummaryDto] })
  @Post('summaries')
  @HttpCode(HttpStatus.OK)
  async summarize(@Body() dto: ExpoIdsRequestDto): Promise<SurveySummaryDto[]> {
    return this.surveyService.summarize(dto.expoIds);
  }
}
