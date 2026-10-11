import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { dateTimeRequestSchema } from '../../common/zod/date-time.schema.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
import {
  dynamicFormFieldSchema,
  PERIOD_ERROR,
  withValidPeriod,
} from './create-form.request.dto.js';
import { checkProgramFormFields } from './program-form-fields.rule.js';

/**
 * 프로그램용 폼의 입력 필드 하나. 등록용 필드와 같은 모양이지만, 신청 처리가 값을 직접 읽는 의미 있는
 * 필드(이름·직업·소속 학교 등)가 아니라 관리자가 자유롭게 정의한 필드라 `dynamicFormType`은 `DEFAULT`뿐이다.
 * 생략하면 `DEFAULT`다.
 */
export const programFormFieldSchema = dynamicFormFieldSchema.extend({
  dynamicFormType: z
    .literal(DynamicFormType.DEFAULT)
    .default(DynamicFormType.DEFAULT),
});

/**
 * 프로그램용 폼 생성·수정 요청의 공통 필드. 등록용과 달리 신청 방식(`applicationType`)이 없고, 이름·직업·
 * 동행자 같은 특정 문항을 강제하지 않는다.
 *
 * `expoId`는 생성에서만 경로로 받는다 — 수정·삭제·조회는 `formId`로 폼을 식별한다.
 */
const programFormFieldsSchema = z.object({
  title: z.string().min(1).max(100),
  informationText: z.string().max(500),
  participantType: z.enum(ParticipationType),
  startDate: dateTimeRequestSchema(),
  endDate: dateTimeRequestSchema(),
  dynamicForm: z.array(programFormFieldSchema),
});

export const createProgramFormSchema = programFormFieldsSchema
  .refine(withValidPeriod, PERIOD_ERROR)
  .superRefine(checkProgramFormFields);

/**
 * 수정 요청. `expectedVersion`은 수정할 때 기준으로 삼은 폼 버전이다. 현재 버전과 다르면 다른 관리자가 먼저
 * 고쳤거나 폼을 불러온 뒤 정의가 바뀐 것이라 409로 거절한다.
 */
export const updateProgramFormSchema = programFormFieldsSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .refine(withValidPeriod, PERIOD_ERROR)
  .superRefine(checkProgramFormFields);

export class CreateProgramFormRequestDto extends createZodDto(
  createProgramFormSchema,
) {}

export class UpdateProgramFormRequestDto extends createZodDto(
  updateProgramFormSchema,
) {}
