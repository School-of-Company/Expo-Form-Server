import { z } from 'zod';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import type { JsonData, OtherJson } from './field-spec.schema.js';

/**
 * 답변을 검증하는 데 필요한 문항 정보만 담은 최소 스펙.
 * `DynamicFormEntity`/`DynamicSurveyEntity` 양쪽 다 이 모양을 만족하므로, 폼 제출과 설문 제출이
 * 이 스펙 조립기를 그대로 공유할 수 있다.
 */
export interface QuestionSpec {
  id: number;
  formType: DynamicFormFieldType;
  requiredStatus: boolean;
  jsonData: JsonData;
  otherJson: OtherJson | null;
}

/**
 * 문항 하나가 허용하는 답변 값의 형태를 문항 스펙에서 조립한다.
 *
 * - `SENTENCE` — 빈 문자열이 아닌 텍스트.
 * - `CHECKBOX` — 예/아니오 성격의 단일 체크박스라 `jsonData`를 쓰지 않는다.
 * - `DROPDOWN` — `jsonData`의 키 중 하나.
 * - `MULTIPLE` — `jsonData`의 키로 이루어진 배열, 있으면 `otherJson.maxSelection`까지만 허용.
 * - `IMAGE` — 실제 업로드 처리(파일 저장·CDN)는 이 서비스 범위 밖이다. 별도 업로드 흐름이 이미
 *   만들어낸 참조 값(URL 등)을 문자열로만 받는다고 가정한다.
 */
function buildValueSchema(question: QuestionSpec): z.ZodTypeAny {
  const base = ((): z.ZodTypeAny => {
    switch (question.formType) {
      case DynamicFormFieldType.SENTENCE:
      case DynamicFormFieldType.IMAGE:
        return z.string().min(1);
      case DynamicFormFieldType.CHECKBOX:
        return z.boolean();
      case DynamicFormFieldType.DROPDOWN: {
        const keys = Object.keys(question.jsonData);
        return z.string().refine((value) => keys.includes(value), {
          message: '선택 가능한 값이 아닙니다.',
        });
      }
      case DynamicFormFieldType.MULTIPLE: {
        const keys = Object.keys(question.jsonData);
        const maxSelection = question.otherJson?.maxSelection;
        let schema = z
          .array(
            z.string().refine((value) => keys.includes(value), {
              message: '선택 가능한 값이 아닙니다.',
            }),
          )
          .min(1);
        if (maxSelection !== undefined) schema = schema.max(maxSelection);
        return schema;
      }
    }
  })();

  return question.requiredStatus ? base : base.optional();
}

/**
 * 저장된 문항 스펙으로부터, 제출된 답변 전체를 검증할 Zod 스키마를 조립한다.
 *
 * 문항 id(숫자)를 문자열 키로 써서 `{ [questionId]: value }` 형태를 기대한다 — v1은 문항
 * 제목 문자열을 키로 썼는데, 문항명을 바꾸면 과거 데이터와 연결이 끊기는 문제가 있었다.
 * id는 문항을 통째로 교체하지 않는 한 안정적이므로 이쪽이 더 안전한 키다.
 *
 * `.strict()`로 스펙에 없는 문항 id가 섞여 들어오면 거부한다 — 알 수 없는 키를 조용히
 * 버리지 않는다.
 */
export function buildAnswerSchema(questions: readonly QuestionSpec[]) {
  const shape = Object.fromEntries(
    questions.map((question) => [
      String(question.id),
      buildValueSchema(question),
    ]),
  );

  return z.object(shape).strict();
}
