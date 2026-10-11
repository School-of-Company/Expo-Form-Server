import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { ProgramFormResponseDto } from './dto/program-form.response.dto.js';
import { FormService } from './form.service.js';

/**
 * 다른 서비스가 부르는 `/internal/program-forms` 엔트리포인트. Gateway를 거치지 않고 `X-Internal-Token`으로만
 * 인증한다({@link InternalTokenGuard}). 신청 서비스가 프로그램 신청 답변을 검증할 때 폼 정의를 읽는다.
 */
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal/program-forms')
export class InternalProgramFormController {
  constructor(private readonly formService: FormService) {}

  @ApiOperation({
    summary: '프로그램용 폼 조회 (내부)',
    description:
      'formId로 프로그램용 폼 하나를 입력 필드 스펙과 version까지 담아 조회한다. 공개 조회와 같은 응답이다.',
  })
  @ApiOkResponse({ type: ProgramFormResponseDto })
  @ApiErrorResponse(404, '해당 폼이 없음 (FORM_NOT_FOUND)')
  @Get(':formId')
  async findOne(
    @Param('formId', ParseUUIDPipe) formId: string,
  ): Promise<ProgramFormResponseDto> {
    return this.formService.findProgram(formId);
  }
}
