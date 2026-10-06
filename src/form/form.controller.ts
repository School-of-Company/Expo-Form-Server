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
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { CreateFormResponseDto } from './dto/create-form.response.dto.js';
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { UpdateFormRequestDto } from './dto/update-form.request.dto.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { FormService } from './form.service.js';

/** `/forms` HTTP 엔트리포인트. */
@ApiTags('forms')
@Controller('forms')
export class FormController {
  constructor(private readonly formService: FormService) {}

  /** 폼을 생성한다. 같은 조합의 폼이 이미 있으면 409가 나간다. */
  @ApiOperation({
    summary: '폼 생성',
    description:
      '박람회의 신청 폼과 입력 필드를 함께 만든다. (박람회, 참여자군, 신청방식) 조합당 하나만 존재한다.',
  })
  @ApiCreatedResponse({ type: CreateFormResponseDto })
  @ApiErrorResponse(409, '같은 조합의 폼이 이미 있음 (FORM_ALREADY_EXISTS)')
  @Post(':expoId')
  async create(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: CreateFormRequestDto,
  ): Promise<CreateFormResponseDto> {
    return this.formService.create(expoId, dto);
  }

  /**
   * (박람회, 참여자군, 신청방식)으로 폼 하나를 조회한다.
   * 신청 페이지는 formId를 모르기 때문에 id가 아니라 이 조합으로 찾는다.
   */
  @ApiOperation({
    summary: '폼 조회',
    description:
      '(박람회, 참여자군, 신청방식)으로 폼 하나를 입력 필드 스펙까지 담아 조회한다. 쿼리 키는 v1과 같은 `type`이다.',
  })
  @ApiOkResponse({ type: FormResponseDto })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Get(':expoId')
  async findOne(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Query() dto: FindFormRequestDto,
  ): Promise<FormResponseDto> {
    return this.formService.findOne(expoId, dto);
  }

  /**
   * 폼을 수정한다. 입력 필드는 병합이 아니라 통째로 교체된다.
   * 대상 폼은 경로의 `expoId`와 바디의 `participationType`+`applicationType` 조합으로 식별한다.
   */
  @ApiOperation({
    summary: '폼 수정',
    description:
      '폼 메타데이터를 갱신하고 입력 필드를 통째로 교체한다. 대상은 경로의 expoId와 바디의 참여자군·신청방식 조합으로 식별한다.',
  })
  @ApiNoContentResponse({ description: '수정 완료' })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Patch(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: UpdateFormRequestDto,
  ): Promise<void> {
    return this.formService.update(expoId, dto);
  }

  /**
   * 폼을 삭제한다. 딸린 입력 필드도 함께 지워진다.
   * 대상 폼은 (박람회, 참여자군, 신청방식) 조합으로 식별한다.
   */
  @ApiOperation({
    summary: '폼 삭제',
    description: '폼과 딸린 입력 필드를 함께 삭제한다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Delete(':expoId/:participationType/:applicationType')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Param('participationType', new ParseEnumPipe(ParticipationType))
    participationType: ParticipationType,
    @Param('applicationType', new ParseEnumPipe(ApplicationType))
    applicationType: ApplicationType,
  ): Promise<void> {
    return this.formService.delete(expoId, participationType, applicationType);
  }
}
