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
import { dateTimeRequestSchema } from '../../common/zod/date-time.schema.js';

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
 * 폼 생성 요청의 필드 구성.
 *
 * `expoId`는 경로 파라미터로 받으므로 바디에는 없다 — 박람회 서비스 소유 값이라 컨트롤러에서
 * 형식(uuid)만 검증하고 존재 여부는 확인하지 않는다.
 * 날짜는 JSON으로 문자열이 실려오므로 `Date`로 바꿔 받는다(`dateTimeRequestSchema`).
 *
 * 수정 요청도 이 구성을 재사용한다.
 *
 * `participantType`은 오타처럼 보이지만 v1의 실제 필드명이다 — 아직 연결된 클라이언트가
 * 없는 신규 구현이라도 이 계약은 일부러 v1과 어긋나게 두지 않기로 했다.
 */
export const createFormFieldsSchema = z.object({
  title: z.string().min(1).max(100),
  informationText: z.string().max(500),
  participantType: z.enum(ParticipationType),
  applicationType: z.enum(ApplicationType),
  startDate: dateTimeRequestSchema(),
  endDate: dateTimeRequestSchema(),
  dynamicForm: z.array(dynamicFormFieldSchema),
});

/** 접수 시작일이 종료일보다 앞서는지 — 두 필드가 서로 맞아야 하는 규칙이라 스키마에서 검증한다. */
export const withValidPeriod = <T extends { startDate: Date; endDate: Date }>(
  value: T,
): boolean => value.startDate < value.endDate;

export const PERIOD_ERROR = {
  message: '접수 시작일은 종료일보다 앞서야 합니다.',
  path: ['endDate'],
};

export const createFormSchema = createFormFieldsSchema.refine(
  withValidPeriod,
  PERIOD_ERROR,
);

export class CreateFormRequestDto extends createZodDto(createFormSchema) {}
