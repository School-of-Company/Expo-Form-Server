import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { CreateSurveyResponseDto } from './dto/create-survey.response.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
import { UpdateSurveyRequestDto } from './dto/update-survey.request.dto.js';
import { SurveyService } from './survey.service.js';

/** `/v1/surveys` HTTP 엔트리포인트. */
@Controller('v1/surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  /** 설문을 생성한다. 같은 (박람회, 참여자군) 조합의 설문이 이미 있으면 409가 나간다. */
  @Post()
  create(
    @Body() dto: CreateSurveyRequestDto,
  ): Promise<CreateSurveyResponseDto> {
    return this.surveyService.create(dto);
  }

  /**
   * (박람회, 참여자군)으로 설문 하나를 조회한다.
   * 응답 페이지는 surveyId를 모르기 때문에 id가 아니라 이 조합으로 찾는다.
   */
  @Get()
  findOne(@Query() dto: FindSurveyRequestDto): Promise<SurveyResponseDto> {
    return this.surveyService.findOne(dto);
  }

  /**
   * 설문을 수정한다. 문항은 병합이 아니라 통째로 교체된다.
   * `surveyId`는 그대로 DB 쿼리에 들어가므로, uuid가 아닌 값은 여기서 400으로 걸러낸다.
   */
  @Patch(':surveyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @Body() dto: UpdateSurveyRequestDto,
  ): Promise<void> {
    return this.surveyService.update(surveyId, dto);
  }

  /** 설문을 삭제한다. 딸린 문항도 함께 지워진다. */
  @Delete(':surveyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('surveyId', ParseUUIDPipe) surveyId: string): Promise<void> {
    return this.surveyService.delete(surveyId);
  }
}
