import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import {
  jsonDataSchema,
  otherJsonSchema,
} from '../../json/field-spec.schema.js';

/**
 * 설문 조회 응답. 응답 페이지를 그리는 데 필요한 것(설문 메타 + 문항 목록 + 각 문항의 스펙)을
 * 한 번에 담는다. 문항의 `id`는 설문을 수정할 때마다 새로 발급된다 —
 * 수정이 문항을 통째로 교체하는 방식이기 때문이다.
 */
export const surveyResponseSchema = z.object({
  id: z.uuid(),
  expoId: z.uuid(),
  title: z.string(),
  informationText: z.string(),
  participationType: z.enum(ParticipationType),
  /** 누적 응답 수. 응답 제출 API가 생기기 전까지는 항상 0이다. */
  totalAnswers: z.number().int().nonnegative(),
  dynamicSurvey: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      formType: z.enum(DynamicFormFieldType),
      requiredStatus: z.boolean(),
      jsonData: jsonDataSchema,
      otherJson: otherJsonSchema.nullable(),
    }),
  ),
});

export class SurveyResponseDto extends createZodDto(surveyResponseSchema) {}
