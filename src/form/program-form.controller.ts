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
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import {
  CreateProgramFormRequestDto,
  UpdateProgramFormRequestDto,
} from './dto/program-form.request.dto.js';
import {
  ProgramFormResponseDto,
  ProgramFormVersionResponseDto,
} from './dto/program-form.response.dto.js';
import { FormService } from './form.service.js';

/**
 * `/program-forms` HTTP 엔트리포인트. 프로그램 신청에 쓰는 폼이다. 등록용 폼(`/forms`)과 달리 박람회당 여러 개를
 * 만들 수 있고 formId로 식별한다.
 */
@ApiTags('program-forms')
@Controller('program-forms')
export class ProgramFormController {
  constructor(private readonly formService: FormService) {}

  @ApiOperation({
    summary: '프로그램용 폼 생성',
    description:
      '박람회에 프로그램 신청용 폼과 입력 필드를 함께 만든다. 같은 박람회에서 제목이 겹치면 안 되고, 이름·직업 같은 특정 필드를 강제하지 않는다.',
  })
  @ApiCreatedResponse({ type: ProgramFormVersionResponseDto })
  @ApiErrorResponse(404, '박람회가 없음 (EXPO_NOT_FOUND)')
  @ApiErrorResponse(
    409,
    '같은 박람회에 같은 제목의 프로그램용 폼이 있음 (PROGRAM_FORM_TITLE_DUPLICATED)',
  )
  @ApiErrorResponse(410, '삭제된 박람회 (EXPO_DELETED)')
  @ApiErrorResponse(
    503,
    '박람회 서비스에 확인할 수 없음 (EXTERNAL_SERVICE_UNAVAILABLE)',
  )
  @Post(':expoId')
  async create(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: CreateProgramFormRequestDto,
  ): Promise<ProgramFormVersionResponseDto> {
    return this.formService.createProgram(expoId, dto);
  }

  @ApiOperation({
    summary: '프로그램용 폼 조회',
    description:
      'formId로 프로그램용 폼 하나를 입력 필드 스펙과 version까지 담아 조회한다.',
  })
  @ApiOkResponse({ type: ProgramFormResponseDto })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Get(':formId')
  async findOne(
    @Param('formId', ParseUUIDPipe) formId: string,
  ): Promise<ProgramFormResponseDto> {
    return this.formService.findProgram(formId);
  }

  @ApiOperation({
    summary: '프로그램용 폼 수정',
    description:
      '폼 메타데이터를 갱신하고 입력 필드를 통째로 교체한다. 바디의 expectedVersion이 현재 버전과 같을 때만 바뀌고, 성공하면 version이 1 오른다.',
  })
  @ApiOkResponse({ type: ProgramFormVersionResponseDto })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @ApiErrorResponse(
    409,
    'expectedVersion이 현재 버전과 다름 (FORM_VERSION_CONFLICT), 또는 제목이 겹침 (PROGRAM_FORM_TITLE_DUPLICATED)',
  )
  @ApiErrorResponse(410, '삭제된 박람회 (EXPO_DELETED)')
  @Patch(':formId')
  async update(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: UpdateProgramFormRequestDto,
  ): Promise<ProgramFormVersionResponseDto> {
    return this.formService.updateProgram(formId, dto);
  }

  @ApiOperation({
    summary: '프로그램용 폼 삭제',
    description: '폼과 딸린 입력 필드를 함께 삭제한다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Delete(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('formId', ParseUUIDPipe) formId: string): Promise<void> {
    return this.formService.deleteProgram(formId);
  }
}
