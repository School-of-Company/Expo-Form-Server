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
import { AdminChangeNotify } from '../common/notification/admin-change-notify.js';
import {
  CreateProgramFormRequestDto,
  UpdateProgramFormRequestDto,
} from './dto/program-form.request.dto.js';
import {
  ProgramFormListItemResponseDto,
  ProgramFormResponseDto,
  ProgramFormVersionResponseDto,
} from './dto/program-form.response.dto.js';
import { FormService } from './form.service.js';

/**
 * 프로그램용 폼 HTTP 엔트리포인트. 프로그램 신청에 쓰는 폼이다. 등록용 폼과 달리 박람회당 여러 개를 만들 수 있고
 * formId로 식별한다. 경로는 모두 `/forms` 아래에 두되 등록용 경로(`GET /forms/:expoId`,
 * `DELETE /forms/:expoId/:participationType/:applicationType` 등)와 겹치지 않게 `expos/…/program-forms`와
 * `by-id/:formId` 하위 경로를 쓴다.
 */
@ApiTags('program-forms')
@Controller('forms')
export class ProgramFormController {
  constructor(private readonly formService: FormService) {}

  @ApiOperation({
    summary: '프로그램용 폼 생성',
    description:
      '박람회에 프로그램 신청용 폼과 입력 필드를 함께 만든다. 같은 박람회에서 제목이 겹치면 안 되고, 이름·직업 같은 특정 필드를 강제하지 않는다. 이미지(IMAGE)·동반자(COMPANION)·지역(REGION) 필드와 기타 입력(otherJson.hasEtc)은 프로그램용 폼에서 쓸 수 없다(400). 답변 값 규칙은 docs/program-form-answer-contract.md.',
  })
  @ApiCreatedResponse({ type: ProgramFormVersionResponseDto })
  @ApiErrorResponse(
    400,
    '요청이 규칙에 맞지 않음 (필드 제목 중복, 쓸 수 없는 필드 유형·기타 입력, 선택지 누락, 잘못된 기간 등)',
  )
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
  @AdminChangeNotify('프로그램용 폼 생성')
  @Post('expos/:expoId/program-forms')
  async create(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: CreateProgramFormRequestDto,
  ): Promise<ProgramFormVersionResponseDto> {
    return this.formService.createProgram(expoId, dto);
  }

  @ApiOperation({
    summary: '프로그램용 폼 목록 조회',
    description:
      '박람회의 프로그램용 폼만 생성순으로 내려준다. 등록용 폼과 설문은 포함하지 않고, 문항(dynamicForm)은 담지 않는다. 회차 연결 여부는 담지 않는다.',
  })
  @ApiOkResponse({ type: [ProgramFormListItemResponseDto] })
  @Get('expos/:expoId/program-forms')
  async findAll(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<ProgramFormListItemResponseDto[]> {
    return this.formService.findProgramsByExpo(expoId);
  }

  @ApiOperation({
    summary: '프로그램용 폼 조회',
    description:
      'formId로 프로그램용 폼 하나를 입력 필드 스펙과 version까지 담아 조회한다.',
  })
  @ApiOkResponse({ type: ProgramFormResponseDto })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Get('by-id/:formId')
  async findOne(
    @Param('formId', ParseUUIDPipe) formId: string,
  ): Promise<ProgramFormResponseDto> {
    return this.formService.findProgram(formId);
  }

  @ApiOperation({
    summary: '프로그램용 폼 수정',
    description:
      '폼 메타데이터를 갱신하고 입력 필드를 통째로 교체한다. 바디의 expectedVersion이 현재 버전과 같을 때만 바뀌고, 성공하면 version이 1 오른다. 회차 참조 보호가 연결되기 전에는 적용 기간을 줄이는 수정을 거절한다. 보호자 동반 정책이 참조하는 폼은 수정할 수 없다(새 폼을 만들어 쓴다). 박람회 서비스에 변경을 예약하지 못하면 503(PROGRAM_FORM_RESERVATION_UNAVAILABLE)이다. 입력 필드 규칙은 생성과 같다(이미지·동반자·지역 필드와 기타 입력은 400).',
  })
  @ApiOkResponse({ type: ProgramFormVersionResponseDto })
  @ApiErrorResponse(
    400,
    '요청이 규칙에 맞지 않음 (expectedVersion 누락, 쓸 수 없는 필드 유형·기타 입력 등)',
  )
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @ApiErrorResponse(
    409,
    'expectedVersion이 현재 버전과 다름 (FORM_VERSION_CONFLICT), 제목이 겹침 (PROGRAM_FORM_TITLE_DUPLICATED), 적용 기간을 줄이려 함 (PROGRAM_FORM_PROTECTION_PENDING), 또는 보호자 동반 정책이 참조하는 폼 (PROGRAM_FORM_GUARDIAN_POLICY_IN_USE)',
  )
  @ApiErrorResponse(410, '삭제된 박람회 (EXPO_DELETED)')
  @ApiErrorResponse(
    503,
    '박람회 서비스에 변경을 예약하지 못해 수정할 수 없음 (PROGRAM_FORM_RESERVATION_UNAVAILABLE). 박람회 서비스 설정이 없거나 변경 예약 API가 배포되지 않은 경우처럼 재시도로 풀리지 않을 수 있다',
  )
  @AdminChangeNotify('프로그램용 폼 수정')
  @Patch('by-id/:formId')
  async update(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: UpdateProgramFormRequestDto,
  ): Promise<ProgramFormVersionResponseDto> {
    return this.formService.updateProgram(formId, dto);
  }

  @ApiOperation({
    summary: '프로그램용 폼 삭제',
    description:
      '회차가 이 폼을 쓰는지 확인하는 보호(박람회 서비스 참조 검사와 변경 예약)가 연결되기 전에는 삭제를 거절한다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @ApiErrorResponse(
    409,
    '참조 보호가 연결되기 전이라 삭제할 수 없음 (PROGRAM_FORM_PROTECTION_PENDING)',
  )
  @AdminChangeNotify('프로그램용 폼 삭제')
  @Delete('by-id/:formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('formId', ParseUUIDPipe) formId: string): Promise<void> {
    return this.formService.deleteProgram(formId);
  }
}
