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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { CreateSurveyResponseDto } from './dto/create-survey.response.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { UpdateSurveyRequestDto } from './dto/update-survey.request.dto.js';
import { SurveyService } from './survey.service.js';

/** `/surveys` HTTP 엔트리포인트. */
@ApiTags('surveys')
@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  /** 설문을 생성한다. 같은 (박람회, 참여자군) 조합의 설문이 이미 있으면 409가 나간다. */
  @ApiOperation({
    summary: '설문 생성',
    description:
      '박람회의 후기 설문과 문항을 함께 만든다. (박람회, 참여자군) 조합당 하나만 존재한다.',
  })
  @ApiCreatedResponse({ type: CreateSurveyResponseDto })
  @ApiErrorResponse(404, '박람회가 없음 (EXPO_NOT_FOUND)')
  @ApiErrorResponse(409, '같은 조합의 설문이 이미 있음 (SURVEY_ALREADY_EXISTS)')
  @ApiErrorResponse(410, '삭제된 박람회 (EXPO_DELETED)')
  @ApiErrorResponse(
    503,
    '박람회 서비스에 확인할 수 없음 (EXTERNAL_SERVICE_UNAVAILABLE)',
  )
  @Post(':expoId')
  async create(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: CreateSurveyRequestDto,
  ): Promise<CreateSurveyResponseDto> {
    return this.surveyService.create(expoId, dto);
  }

  /**
   * (박람회, 참여자군)으로 설문 하나를 조회한다.
   * 응답 페이지는 surveyId를 모르기 때문에 id가 아니라 이 조합으로 찾는다.
   */
  @ApiOperation({
    summary: '설문 조회',
    description:
      '(박람회, 참여자군)으로 설문 하나를 문항 스펙까지 담아 조회한다. 응답 페이지는 surveyId를 모르므로 이 조합으로 찾는다.',
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

  /**
   * 설문을 수정한다. 문항은 병합이 아니라 통째로 교체된다.
   * 대상 설문은 경로의 `expoId`와 바디의 `participationType` 조합으로 식별한다.
   */
  @ApiOperation({
    summary: '설문 수정',
    description:
      '설문 메타데이터를 갱신하고 문항을 통째로 교체한다. 문항 id가 새로 발급되므로 이미 쌓인 답변과의 연결이 끊긴다.',
  })
  @ApiNoContentResponse({ description: '수정 완료' })
  @ApiErrorResponse(404, '해당 설문이 없음 (SURVEY_NOT_FOUND)')
  @ApiErrorResponse(410, '삭제된 박람회 (EXPO_DELETED)')
  @Patch(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: UpdateSurveyRequestDto,
  ): Promise<void> {
    return this.surveyService.update(expoId, dto);
  }

  /**
   * 설문을 삭제한다. 딸린 문항도 함께 지워진다.
   * 대상 설문은 (박람회, 참여자군) 조합으로 식별한다.
   */
  @ApiOperation({
    summary: '설문 삭제',
    description: '설문과 딸린 문항, 공개 링크 응답을 함께 삭제한다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse(404, '해당 설문이 없음 (SURVEY_NOT_FOUND)')
  @Delete(':expoId/:participationType')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Param('participationType', new ParseEnumPipe(ParticipationType))
    participationType: ParticipationType,
  ): Promise<void> {
    return this.surveyService.delete(expoId, participationType);
  }
}
