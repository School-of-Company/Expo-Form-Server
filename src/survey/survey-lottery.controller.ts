import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import {
  SurveyLotteryResponseDto,
  UpdateSurveyLotteryRequestDto,
} from './dto/survey-lottery.dto.js';
import { SurveyLotteryService } from './survey-lottery.service.js';

/** 박람회별 경품 추첨 설정 HTTP 엔트리포인트 — 관리자 화면이 켜고 끄고 당첨 번호를 고친다. */
@ApiTags('survey-lottery')
@Controller('surveys')
export class SurveyLotteryController {
  constructor(private readonly surveyLotteryService: SurveyLotteryService) {}

  @ApiOperation({
    summary: '경품 추첨 설정 조회',
    description:
      '켜짐 여부, 당첨 번호 목록, 현재까지 센 순번을 조회한다. 순번은 번호를 입력한 응답자만 센 값이다.',
  })
  @ApiOkResponse({ type: SurveyLotteryResponseDto })
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Get(':expoId/lottery')
  async find(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<SurveyLotteryResponseDto> {
    return this.surveyLotteryService.find(expoId);
  }

  @ApiOperation({
    summary: '경품 추첨 설정 변경',
    description:
      '켜고 끄는 것과 당첨 번호 목록을 바꾼다. 번호는 1 이상의 정수이고 중복 없이 최대 100개이며 비우면 추첨하지 않는다. 진행 중에 바꿔도 이미 지나간 순번은 다시 오지 않고, 순번은 끄고 켜도 이어서 센다.',
  })
  @ApiOkResponse({ type: SurveyLotteryResponseDto })
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Patch(':expoId/lottery')
  async update(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: UpdateSurveyLotteryRequestDto,
  ): Promise<SurveyLotteryResponseDto> {
    return this.surveyLotteryService.update(expoId, dto);
  }
}
