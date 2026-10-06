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
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormSummaryDto } from './dto/form-summary.response.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { FormService } from './form.service.js';

/**
 * 다른 서비스가 부르는 `/internal/forms` 엔트리포인트. Gateway를 거치지 않고 `X-Internal-Token`으로만
 * 인증한다({@link InternalTokenGuard}). v1에서 다른 도메인이 폼 저장소를 직접 읽던 자리를 대신한다.
 */
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal/forms')
export class InternalFormController {
  constructor(private readonly formService: FormService) {}

  /** 신청 서비스가 제출된 신청서를 검증할 때 폼 스펙(이름·직업·소속 학교 필드 위치 등)을 읽는다. */
  @ApiOperation({
    summary: '폼 조회 (내부)',
    description:
      '(박람회, 참여자군, 신청방식)으로 폼 하나를 입력 필드 스펙까지 담아 조회한다. 공개 조회와 같은 응답이다.',
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

  /** 박람회 서비스가 박람회 목록에 "폼 만들었는지"를 표시할 때 쓴다(v1 `GetExpoValidationStatus`). */
  @ApiOperation({
    summary: '박람회별 폼 현황 (내부)',
    description:
      '여러 박람회에 만들어진 폼의 (박람회, 참여자군, 신청방식)을 돌려준다. 폼이 없는 박람회는 결과에 없다.',
  })
  @ApiOkResponse({ type: [FormSummaryDto] })
  @Post('summaries')
  @HttpCode(HttpStatus.OK)
  async summarize(@Body() dto: ExpoIdsRequestDto): Promise<FormSummaryDto[]> {
    return this.formService.summarize(dto.expoIds);
  }

  /** 박람회 서비스가 박람회를 지울 때 그 박람회의 폼을 모두 지운다(v1 `DeleteExpo`). */
  @ApiOperation({
    summary: '박람회 폼 일괄 삭제 (내부)',
    description:
      '박람회의 폼과 입력 필드를 모두 삭제한다. 폼이 없어도 204라 다시 불러도 안전하다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @Delete(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAll(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<void> {
    return this.formService.deleteAllByExpo(expoId);
  }
}
