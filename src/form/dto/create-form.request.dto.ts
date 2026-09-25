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

export const dynamicFormFieldSchema = z.object({
  title: z.string().min(1).max(100),
  formType: z.enum(DynamicFormFieldType),
  requiredStatus: z.boolean(),
  jsonData: jsonDataSchema,
  otherJson: otherJsonSchema.nullable(),
  dynamicFormType: z.enum(DynamicFormType),
});

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
