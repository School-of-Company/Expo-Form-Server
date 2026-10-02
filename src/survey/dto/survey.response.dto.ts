import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import {
  jsonDataSchema,
  otherJsonSchema,
} from '../../json/field-spec.schema.js';
import type { SurveyEntity } from '../entities/survey.entity.js';

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
  dynamicSurveyResponseDto: z.array(
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

/**
 * 엔티티를 응답 DTO로 변환한다. 엔티티를 그대로 내보내지 않는 이유는,
 * 감사 컬럼(`createdAt`/`updatedAt`)이나 양방향 관계처럼 외부에 노출할 필요 없는 것들을
 * 응답 계약에서 분리해두기 위해서다. 일반 조회와 QR 토큰 조회가 같은 응답을 쓴다.
 */
export function toSurveyResponse(survey: SurveyEntity): SurveyResponseDto {
  return {
    id: survey.id,
    expoId: survey.expoId,
    title: survey.title,
    informationText: survey.informationText,
    participationType: survey.participationType,
    totalAnswers: survey.totalAnswers,
    dynamicSurveyResponseDto: survey.dynamicSurveys.map((question) => ({
      id: question.id,
      title: question.title,
      formType: question.formType,
      requiredStatus: question.requiredStatus,
      jsonData: question.jsonData,
      otherJson: question.otherJson,
    })),
  };
}
