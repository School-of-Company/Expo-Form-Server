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
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { CreateFormResponseDto } from './dto/create-form.response.dto.js';
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { UpdateFormRequestDto } from './dto/update-form.request.dto.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { FormService } from './form.service.js';

/** `/v1/forms` HTTP 엔트리포인트. */
@Controller('v1/forms')
export class FormController {
  constructor(private readonly formService: FormService) {}

  /** 폼을 생성한다. 같은 조합의 폼이 이미 있으면 409가 나간다. */
  @Post(':expoId')
  create(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: CreateFormRequestDto,
  ): Promise<CreateFormResponseDto> {
    return this.formService.create(expoId, dto);
  }

  /**
   * (박람회, 참여자군, 신청방식)으로 폼 하나를 조회한다.
   * 신청 페이지는 formId를 모르기 때문에 id가 아니라 이 조합으로 찾는다.
   */
  @Get(':expoId')
  findOne(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Query() dto: FindFormRequestDto,
  ): Promise<FormResponseDto> {
    return this.formService.findOne(expoId, dto);
  }

  /**
   * 폼을 수정한다. 입력 필드는 병합이 아니라 통째로 교체된다.
   * 대상 폼은 경로의 `expoId`와 바디의 `participationType`+`applicationType` 조합으로 식별한다.
   */
  @Patch(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: UpdateFormRequestDto,
  ): Promise<void> {
    return this.formService.update(expoId, dto);
  }

  /**
   * 폼을 삭제한다. 딸린 입력 필드도 함께 지워진다.
   * 대상 폼은 (박람회, 참여자군, 신청방식) 조합으로 식별한다.
   */
  @Delete(':expoId/:participationType/:applicationType')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Param('participationType', new ParseEnumPipe(ParticipationType))
    participationType: ParticipationType,
    @Param('applicationType', new ParseEnumPipe(ApplicationType))
    applicationType: ApplicationType,
  ): Promise<void> {
    return this.formService.delete(expoId, participationType, applicationType);
  }
}
