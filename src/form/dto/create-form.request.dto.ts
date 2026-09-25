import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import {
  jsonDataSchema,
  otherJsonSchema,
} from '../../json/field-spec.schema.js';
import { ApplicationType } from '../entities/application-type.enum.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';

/**
 * 폼에 들어갈 입력 필드 하나.
 * `jsonData`(선택지)와 `otherJson`(기타입력·최대선택수·조건부표시)은 `json` 모듈의 스펙 스키마를 그대로 쓴다.
 */
export const dynamicFormFieldSchema = z.object({
  title: z.string().min(1).max(100),
  formType: z.enum(DynamicFormFieldType),
  requiredStatus: z.boolean(),
  jsonData: jsonDataSchema,
  otherJson: otherJsonSchema.nullable(),
  dynamicFormType: z.enum(DynamicFormType),
});

/**
 * 폼 생성 요청.
 *
 * `expoId`는 박람회 서비스 소유 값이라 형식(uuid)만 검증하고 존재 여부는 확인하지 않는다.
 * 날짜는 JSON으로 문자열이 실려오므로 `z.coerce.date()`로 `Date`로 바꿔 받는다.
 */
export const createFormSchema = z.object({
  expoId: z.uuid(),
  title: z.string().min(1).max(100),
  informationText: z.string().max(500),
  participationType: z.enum(ParticipationType),
  applicationType: z.enum(ApplicationType),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  dynamicForm: z.array(dynamicFormFieldSchema),
});

export class CreateFormRequestDto extends createZodDto(createFormSchema) {}
