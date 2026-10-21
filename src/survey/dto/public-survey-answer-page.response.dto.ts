import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { Occupation } from '../../common/enums/occupation.enum.js';
import {
  jsonDataSchema,
  otherJsonSchema,
} from '../../json/field-spec.schema.js';

/**
 * 공개 설문 응답 한 페이지(#215). 리포트 서비스가 익명 응답 엑셀을 만들 때 끝까지 읽는다.
 *
 * 응답에는 문항 버전이나 제출 당시 스냅샷이 저장돼 있지 않다. `questions`는 지금의 문항 정의이고
 * `questionDefinition: 'CURRENT'`로 그 뜻을 밝힌다. 응답이 하나라도 있으면 문항을 바꿀 수 없어서(#179)
 * 응답이 있는 동안은 지금 정의가 곧 응답 당시 정의다.
 *
 * 익명 응답이라 참가자 id·이름·입장 QR이 없고, 경품 전화번호는 다른 테이블에 있어 싣지 않는다.
 */
export const publicSurveyAnswerPageSchema = z.object({
  survey: z.object({ id: z.uuid(), expoId: z.uuid(), title: z.string() }),
  questionDefinition: z.literal('CURRENT'),
  questions: z.array(
    z.object({
      id: z.number().int(),
      order: z.number().int(),
      title: z.string(),
      formType: z.enum(DynamicFormFieldType),
      requiredStatus: z.boolean(),
      jsonData: jsonDataSchema,
      otherJson: otherJsonSchema.nullable(),
    }),
  ),
  /** 첫 페이지에서 고정한 조회 상한(이 시각 포함, 마이크로초 UTC). 모든 페이지가 같다. */
  snapshotAt: z.string(),
  /** 상한까지의 응답 수. 끝까지 읽은 행 수의 합과 같다. */
  totalCount: z.number().int().nonnegative(),
  /** 제출 시각, 응답 id 오름차순. 같은 사람의 반복 응답도 각각 한 행이다. */
  answers: z.array(
    z.object({
      id: z.uuid(),
      createdAt: z.string(),
      occupation: z.enum(Occupation),
      /** `{ [문항id]: 값 }`. 제출 때 검증해 저장한 값 그대로다. */
      answers: z.record(z.string(), z.unknown()),
    }),
  ),
  /** 다음 페이지 커서. `null`이면 마지막 페이지다. */
  nextCursor: z.string().nullable(),
});

export class PublicSurveyAnswerPageResponseDto extends createZodDto(
  publicSurveyAnswerPageSchema,
) {}
