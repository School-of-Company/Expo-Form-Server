import { Injectable, Logger } from '@nestjs/common';
import {
  FormAlreadyExistsException,
  FormNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { UpdateFormRequestDto } from './dto/update-form.request.dto.js';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { FormEntity } from './entities/form.entity.js';
import { FormStore } from './form.store.js';

@Injectable()
export class FormService {
  private readonly logger = new Logger(FormService.name);

  constructor(private readonly formStore: FormStore) {}

  async create(dto: CreateFormRequestDto): Promise<void> {
    const duplicated = await this.formStore.existsByExpoAndTypes(
      dto.expoId,
      dto.participationType,
      dto.applicationType,
    );

    if (duplicated) throw new FormAlreadyExistsException();

    const form = new FormEntity();
    form.expoId = dto.expoId;
    form.title = dto.title;
    form.informationText = dto.informationText;
    form.participationType = dto.participationType;
    form.applicationType = dto.applicationType;
    form.startDate = dto.startDate;
    form.endDate = dto.endDate;
    form.dynamicForms = dto.dynamicForm.map((field) =>
      this.toFieldEntity(field),
    );

    const saved = await this.formStore.save(form);
    this.logger.log(`폼 생성 완료: formId=${saved.id}, expoId=${dto.expoId}`);
  }

  /** v1과 동일하게 기존 필드를 전부 버리고 새로 넣는다(필드 단위 병합 없음). */
  async update(formId: string, dto: UpdateFormRequestDto): Promise<void> {
    const form = await this.formStore.findById(formId);
    if (!form) throw new FormNotFoundException();

    form.title = dto.title;
    form.informationText = dto.informationText;
    form.participationType = dto.participationType;
    form.applicationType = dto.applicationType;
    form.startDate = dto.startDate;
    form.endDate = dto.endDate;

    const fields = dto.dynamicForm.map((field) => this.toFieldEntity(field));

    await this.formStore.updateWithFields(form, fields);
    this.logger.log(
      `폼 수정 완료: formId=${formId}, 필드 ${fields.length}개로 교체`,
    );
  }

  async delete(formId: string): Promise<void> {
    const form = await this.formStore.findById(formId);
    if (!form) throw new FormNotFoundException();

    await this.formStore.deleteById(formId);
    this.logger.log(`폼 삭제 완료: formId=${formId}`);
  }

  async findOne(dto: FindFormRequestDto): Promise<FormResponseDto> {
    const form = await this.formStore.findByExpoAndTypes(
      dto.expoId,
      dto.participationType,
      dto.applicationType,
    );

    if (!form) throw new FormNotFoundException();

    return this.toResponse(form);
  }

  private toFieldEntity(
    field: CreateFormRequestDto['dynamicForm'][number],
  ): DynamicFormEntity {
    const entity = new DynamicFormEntity();
    entity.title = field.title;
    entity.formType = field.formType;
    entity.requiredStatus = field.requiredStatus;
    entity.jsonData = field.jsonData;
    entity.otherJson = field.otherJson;
    entity.dynamicFormType = field.dynamicFormType;
    return entity;
  }

  private toResponse(form: FormEntity): FormResponseDto {
    return {
      id: form.id,
      expoId: form.expoId,
      title: form.title,
      informationText: form.informationText,
      participationType: form.participationType,
      applicationType: form.applicationType,
      startDate: form.startDate,
      endDate: form.endDate,
      dynamicForm: form.dynamicForms.map((field) => ({
        id: field.id,
        title: field.title,
        formType: field.formType,
        requiredStatus: field.requiredStatus,
        jsonData: field.jsonData,
        otherJson: field.otherJson,
        dynamicFormType: field.dynamicFormType,
      })),
    };
  }
}
