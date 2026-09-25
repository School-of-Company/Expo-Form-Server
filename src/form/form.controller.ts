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

  @Post()
  create(@Body() dto: CreateFormRequestDto): Promise<void> {
    return this.formService.create(dto);
  }

  @Get()
  findOne(@Query() dto: FindFormRequestDto): Promise<FormResponseDto> {
    return this.formService.findOne(dto);
  }

  @Patch(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Param('formId') formId: string,
    @Body() dto: UpdateFormRequestDto,
  ): Promise<void> {
    return this.formService.update(formId, dto);
  }

  @Delete(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('formId') formId: string): Promise<void> {
    return this.formService.delete(formId);
  }
}
