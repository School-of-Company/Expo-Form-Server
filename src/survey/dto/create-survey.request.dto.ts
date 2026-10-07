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
 * `expoId`는 경로 파라미터로 받으므로 바디에는 없다 — 박람회 서비스 소유 값이라 컨트롤러에서
 * 형식(uuid)만 검증하고 존재 여부는 확인하지 않는다.
 *
 * `totalAnswers`는 요청으로 받지 않는다. 누적 응답 수는 응답 제출이 만들어내는 값이지
 * 설문 작성자가 정하는 값이 아니다.
 *
 * `dynamicSurveyRequestDto`는 v1의 실제 필드명을 그대로 따른다 — DTO 클래스명이 필드명에
 * 그대로 남아 있어 장황하지만, 아직 연결된 클라이언트가 없는 신규 구현이라도 이 계약은
 * 일부러 v1과 어긋나게 두지 않기로 했다.
 */
const applicationOnlyMessages: Partial<Record<DynamicFormFieldType, string>> = {
  [DynamicFormFieldType.COMPANION]:
    '동반자 필드는 신청 폼에서만 쓸 수 있습니다.',
  [DynamicFormFieldType.REGION]: '지역 필드는 신청 폼에서만 쓸 수 있습니다.',
};

export const createSurveySchema = z
  .object({
    title: z.string().min(1).max(100),
    informationText: z.string().max(500),
    participationType: z.enum(ParticipationType),
    dynamicSurveyRequestDto: z.array(dynamicSurveyQuestionSchema),
  })
  .superRefine((survey, ctx) => {
    // 동반자 추가와 지역은 신청 폼 전용이다. 설문 답변에는 이 개념이 없다.
    for (const [index, question] of survey.dynamicSurveyRequestDto.entries()) {
      const message = applicationOnlyMessages[question.formType];
      if (message !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message,
          path: ['dynamicSurveyRequestDto', index, 'formType'],
        });
      }
    }
  });

export class CreateSurveyRequestDto extends createZodDto(createSurveySchema) {}
