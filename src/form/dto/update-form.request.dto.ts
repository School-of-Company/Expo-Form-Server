import { createZodDto } from 'nestjs-zod';
import {
  createFormFieldsSchema,
  OCCUPATION_OPEN_AT_ERROR,
  PERIOD_ERROR,
  withValidOccupationOpenAt,
  withValidPeriod,
} from './create-form.request.dto.js';
import { checkNameField } from './name-field.rule.js';
import { checkCompanionField } from './companion-field.rule.js';
import { checkRegionField } from './region-field.rule.js';
import { checkOccupationFields } from './occupation-fields.rule.js';

/**
 * 생성과 같은 바디를 받는다. 대상 폼은 경로의 `expoId`와 바디의 `participationType`+
 * `applicationType` 조합으로 식별하므로, 이 조합을 바꾸는 것은 지원하지 않는다.
 * `occupationOpenAt`을 생략하면 기존 값을 유지한다 — 이 필드를 모르는 관리자 화면이 저장해도 지워지지 않게.
 */
export const updateFormSchema = createFormFieldsSchema
  .refine(withValidPeriod, PERIOD_ERROR)
  .refine(withValidOccupationOpenAt, OCCUPATION_OPEN_AT_ERROR)
  .superRefine(checkNameField)
  .superRefine(checkOccupationFields)
  .superRefine(checkCompanionField)
  .superRefine(checkRegionField);

export class UpdateFormRequestDto extends createZodDto(updateFormSchema) {}
