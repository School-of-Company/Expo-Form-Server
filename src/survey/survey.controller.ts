import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { CreateSurveyResponseDto } from './dto/create-survey.response.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { IssueSurveyQrTokensRequestDto } from './dto/issue-survey-qr-tokens.request.dto.js';
import { IssueSurveyQrTokensResponseDto } from './dto/issue-survey-qr-tokens.response.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { UpdateSurveyRequestDto } from './dto/update-survey.request.dto.js';
import { SurveyService } from './survey.service.js';

/** `/surveys` HTTP 엔트리포인트. */
@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  /** 설문을 생성한다. 같은 (박람회, 참여자군) 조합의 설문이 이미 있으면 409가 나간다. */
  @Post(':expoId')
  create(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: CreateSurveyRequestDto,
  ): Promise<CreateSurveyResponseDto> {
    return this.surveyService.create(expoId, dto);
  }

  /**
   * (박람회, 참여자군)으로 설문 하나를 조회한다.
   * 응답 페이지는 surveyId를 모르기 때문에 id가 아니라 이 조합으로 찾는다.
   */
  @Get(':expoId')
  findOne(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Query() dto: FindSurveyRequestDto,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.findOne(expoId, dto);
  }

  /** 종이 QR로 들어온 응답자에게 보여 줄 설문을 조회한다. 이미 쓴 QR이면 409. */
  @Get('qr/:token')
  findOneByQrToken(@Param('token') token: string): Promise<SurveyResponseDto> {
    return this.surveyService.findOneByQrToken(token);
  }

  /** 일반 참가자 설문용 종이 QR 토큰을 발급한다. */
  @Post(':expoId/qr-tokens')
  issueQrTokens(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: IssueSurveyQrTokensRequestDto,
  ): Promise<IssueSurveyQrTokensResponseDto> {
    return this.surveyService.issueQrTokens(expoId, dto);
  }

  /**
   * 설문을 수정한다. 문항은 병합이 아니라 통째로 교체된다.
   * 대상 설문은 경로의 `expoId`와 바디의 `participationType` 조합으로 식별한다.
   */
  @Patch(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: UpdateSurveyRequestDto,
  ): Promise<void> {
    return this.surveyService.update(expoId, dto);
  }

  /**
   * 설문을 삭제한다. 딸린 문항도 함께 지워진다.
   * 대상 설문은 (박람회, 참여자군) 조합으로 식별한다.
   */
  @Delete(':expoId/:participationType')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Param('participationType', new ParseEnumPipe(ParticipationType))
    participationType: ParticipationType,
  ): Promise<void> {
    return this.surveyService.delete(expoId, participationType);
  }
}
