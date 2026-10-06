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
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { SurveySummaryDto } from './dto/survey-summary.response.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { SurveyService } from './survey.service.js';

/**
 * 다른 서비스가 부르는 `/internal/surveys` 엔트리포인트. Gateway를 거치지 않고 `X-Internal-Token`으로만
 * 인증한다({@link InternalTokenGuard}). v1에서 다른 도메인이 설문 저장소를 직접 읽던 자리를 대신한다.
 */
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal/surveys')
export class InternalSurveyController {
  constructor(private readonly surveyService: SurveyService) {}

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

  /** 박람회 서비스가 박람회를 지울 때 그 박람회의 설문을 모두 지운다(v1 `DeleteExpo`). */
  @ApiOperation({
    summary: '박람회 설문 일괄 삭제 (내부)',
    description:
      '박람회의 설문과 문항, 종이 QR 답변을 모두 삭제한다. 설문이 없어도 204라 다시 불러도 안전하다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @Delete(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAll(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<void> {
    return this.surveyService.deleteAllByExpo(expoId);
  }
}
