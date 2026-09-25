import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { UpdateFormRequestDto } from './dto/update-form.request.dto.js';
import { FormService } from './form.service.js';

/** `/v1/forms` HTTP 엔트리포인트. */
@Controller('v1/forms')
export class FormController {
  constructor(private readonly formService: FormService) {}

  /** 폼을 생성한다. 같은 조합의 폼이 이미 있으면 409가 나간다. */
  @Post()
  create(@Body() dto: CreateFormRequestDto): Promise<void> {
    return this.formService.create(dto);
  }

  /**
   * (박람회, 참여자군, 신청방식)으로 폼 하나를 조회한다.
   * 신청 페이지는 formId를 모르기 때문에 id가 아니라 쿼리 조합으로 찾는다.
   */
  @Get()
  findOne(@Query() dto: FindFormRequestDto): Promise<FormResponseDto> {
    return this.formService.findOne(dto);
  }

  /** 폼을 수정한다. 입력 필드는 병합이 아니라 통째로 교체된다. */
  @Patch(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Param('formId') formId: string,
    @Body() dto: UpdateFormRequestDto,
  ): Promise<void> {
    return this.formService.update(formId, dto);
  }

  /** 폼을 삭제한다. 딸린 입력 필드도 함께 지워진다. */
  @Delete(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('formId') formId: string): Promise<void> {
    return this.formService.delete(formId);
  }
}
