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
import { AdminChangeNotify } from '../common/notification/admin-change-notify.js';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { CreateSurveyResponseDto } from './dto/create-survey.response.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { SurveyAnswerCountResponseDto } from './dto/survey-answer-count.response.dto.js';
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
  @AdminChangeNotify('설문 생성')
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
   * 설문의 누적 응답 수를 조회한다. 공개 제출 순번과 같이 늘어 당첨 시점을 알려 주므로 인증 없이 열린 설문
   * 조회에서 떼어 냈다. 게이트웨이 `publicPaths`에 없어 로그인이 필요하다(#169).
   */
  @ApiOperation({
    summary: '설문 누적 응답 수 조회',
    description:
      '(박람회, 참여자군) 설문에 쌓인 응답 수를 조회한다. 관리자 화면이 수정 전에 응답이 있는지 확인할 때 쓴다.',
  })
  @ApiOkResponse({ type: SurveyAnswerCountResponseDto })
  @ApiErrorResponse(404, '해당 설문이 없음 (SURVEY_NOT_FOUND)')
  @Get(':expoId/answer-count')
  async countAnswers(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Query() dto: FindSurveyRequestDto,
  ): Promise<SurveyAnswerCountResponseDto> {
    return this.surveyService.countAnswers(expoId, dto);
  }

  /**
   * 설문을 수정한다. 문항은 병합이 아니라 통째로 교체된다. 응답이 있는 설문은 문항을 바꾸면 409가 나간다.
   * 대상 설문은 경로의 `expoId`와 바디의 `participationType` 조합으로 식별한다.
   */
  @ApiOperation({
    summary: '설문 수정',
    description:
      '설문 메타데이터를 갱신하고 문항을 통째로 교체한다. 문항 id가 새로 발급되므로, 응답이 하나라도 있는 설문은 문항의 추가·삭제·순서·유형·문구·선택지·설정 변경을 409로 막는다. 문항을 지금과 똑같이 보내면 교체하지 않아 문항 id가 그대로이고, 제목·안내 문구·경품 추첨 설정만 바뀐다.',
  })
  @ApiNoContentResponse({ description: '수정 완료' })
  @ApiErrorResponse(404, '해당 설문이 없음 (SURVEY_NOT_FOUND)')
  @ApiErrorResponse(
    409,
    '응답이 있는 설문의 문항을 바꾸려 함 (SURVEY_ALREADY_ANSWERED)',
  )
  @ApiErrorResponse(410, '삭제된 박람회 (EXPO_DELETED)')
  @AdminChangeNotify('설문 수정')
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
  @AdminChangeNotify('설문 삭제')
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
