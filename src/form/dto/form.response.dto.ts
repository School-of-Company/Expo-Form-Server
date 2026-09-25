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
