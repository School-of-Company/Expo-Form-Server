import { createZodDto } from 'nestjs-zod';
import {
  createFormFieldsSchema,
  PERIOD_ERROR,
  withValidPeriod,
} from './create-form.request.dto.js';

/**
 * 생성과 같은 바디를 받는다. 대상 폼은 경로의 `expoId`와 바디의 `participationType`+
 * `applicationType` 조합으로 식별하므로, 이 조합을 바꾸는 것은 지원하지 않는다.
 */
export const updateFormSchema = createFormFieldsSchema.refine(
  withValidPeriod,
  PERIOD_ERROR,
);

export class UpdateFormRequestDto extends createZodDto(updateFormSchema) {}
