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
 * 폼 조회 응답. 신청 페이지를 그리는 데 필요한 것(폼 메타 + 필드 목록 + 각 필드의 스펙)을 한 번에 담는다.
 * 필드의 `id`는 폼을 수정할 때마다 새로 발급된다 — 수정이 필드를 통째로 교체하는 방식이기 때문이다.
 */
export const formResponseSchema = z.object({
  id: z.uuid(),
  expoId: z.uuid(),
  title: z.string(),
  informationText: z.string(),
  participationType: z.enum(ParticipationType),
  applicationType: z.enum(ApplicationType),
  startDate: z.date(),
  endDate: z.date(),
  dynamicForm: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      formType: z.enum(DynamicFormFieldType),
      requiredStatus: z.boolean(),
      jsonData: jsonDataSchema,
      otherJson: otherJsonSchema.nullable(),
      dynamicFormType: z.enum(DynamicFormType),
    }),
  ),
});

export class FormResponseDto extends createZodDto(formResponseSchema) {}
