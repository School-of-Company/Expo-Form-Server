import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import {
  jsonDataSchema,
  otherJsonSchema,
} from '../../json/field-spec.schema.js';

/**
 * 설문에 들어갈 문항 하나.
 * `jsonData`(선택지)와 `otherJson`(기타입력·최대선택수·조건부표시)은 `json` 모듈의 스펙 스키마를
 * 폼 필드와 그대로 공유한다. 폼에 있는 `dynamicFormType`만 빠져 있다 — 그건 신청 처리 로직이
 * 값을 직접 참조하는 필드를 표시하는 값이라 설문에는 대응 개념이 없다.
 */
export const dynamicSurveyQuestionSchema = z.object({
  title: z.string().min(1).max(100),
  formType: z.enum(DynamicFormFieldType),
  requiredStatus: z.boolean(),
  jsonData: jsonDataSchema,
  otherJson: otherJsonSchema.nullable(),
});

/**
 * 설문 생성 요청의 필드 구성.
 *
 * `expoId`는 박람회 서비스 소유 값이라 형식(uuid)만 검증하고 존재 여부는 확인하지 않는다.
 * 폼과 달리 접수 기간·신청 방식이 없어 필드 간 교차 검증(`.refine()`)이 필요 없고, 그래서 이
 * 스키마가 순수 `ZodObject`로 남는다 — 수정 스키마가 중간 단계 없이 여기에 바로 `.omit()`을 건다.
 *
 * `totalAnswers`는 요청으로 받지 않는다. 누적 응답 수는 응답 제출이 만들어내는 값이지
 * 설문 작성자가 정하는 값이 아니다.
 */
export const createSurveySchema = z.object({
  expoId: z.uuid(),
  title: z.string().min(1).max(100),
  informationText: z.string().max(500),
  participationType: z.enum(ParticipationType),
  dynamicSurvey: z.array(dynamicSurveyQuestionSchema),
});

export class CreateSurveyRequestDto extends createZodDto(createSurveySchema) {}
