import { z } from 'zod';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { Region } from '../common/enums/region.enum.js';
import { COMPANION_MAX_COUNT, companionSchema } from './companion.js';
import {
  triggerValuesOf,
  type JsonData,
  type OtherJson,
} from './field-spec.schema.js';

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

/** `DROPDOWN`/`MULTIPLE` 공통 — 값이 `jsonData`의 키 중 하나인지 확인한다. */
function oneOfJsonDataKeys(jsonData: JsonData): z.ZodString {
  const keys = Object.keys(jsonData);
  return z.string().refine((value) => keys.includes(value), {
    message: '선택 가능한 값이 아닙니다.',
  });
}

/**
 * 실제 업로드 처리(파일 저장·CDN)는 이 서비스 범위 밖이다. 별도 업로드 흐름이 이미
 * 만들어낸 참조 값(URL 등)을 문자열로만 받는다고 가정한다.
 */
const buildImageSchema = (): z.ZodType => z.string().min(1);

/**
 * 문항 타입별 답변 값 스펙 조립기.
 *
 * `Record<DynamicFormFieldType, ...>`로 선언해서, 타입이 하나 늘고 여기 빠뜨리면
 * "OOO 프로퍼티가 없다"고 컴파일 타임에 정확히 짚어준다 — switch였다면 "코드 경로가
 * 안 끝났다"는 문구만 나와 어떤 케이스가 빠졌는지 여기서 다시 찾아봐야 한다.
 */
const VALUE_SCHEMA_BUILDERS: Record<
  DynamicFormFieldType,
  (question: QuestionSpec) => z.ZodType
> = {
  /** 빈 문자열이 아닌 텍스트. */
  [DynamicFormFieldType.SENTENCE]: () => z.string().min(1),
  [DynamicFormFieldType.IMAGE]: buildImageSchema,
  /** 예/아니오 성격의 단일 체크박스라 `jsonData`를 쓰지 않는다. */
  [DynamicFormFieldType.CHECKBOX]: () => z.boolean(),
  [DynamicFormFieldType.DROPDOWN]: (question) =>
    oneOfJsonDataKeys(question.jsonData),
  /** `jsonData`의 키로 이루어진 배열. 있으면 `otherJson.maxSelection`까지만 허용한다. */
  [DynamicFormFieldType.MULTIPLE](question) {
    const maxSelection = question.otherJson?.maxSelection;
    let schema = z.array(oneOfJsonDataKeys(question.jsonData)).min(1);
    if (maxSelection !== undefined) {
      schema = schema.max(maxSelection);
    }

    return schema;
  },
  /**
   * 동반자 목록(`{ name, occupation, region, school? }[]`). 최대 인원은 `otherJson.maxSelection`이고 없으면
   * {@link COMPANION_MAX_COUNT}명이며 어느 쪽이든 상한을 넘을 수 없다. 필수이면 1명 이상이다.
   */
  [DynamicFormFieldType.COMPANION](question) {
    const max = Math.min(
      question.otherJson?.maxSelection ?? COMPANION_MAX_COUNT,
      COMPANION_MAX_COUNT,
    );

    return z
      .array(companionSchema)
      .min(question.requiredStatus ? 1 : 0)
      .max(max);
  },
  /** {@link Region} 값 하나. 선택지가 고정이라 `jsonData`를 쓰지 않는다. */
  [DynamicFormFieldType.REGION]: () => z.enum(Region),
};

/** 문항 하나가 허용하는 답변 값의 형태를 문항 스펙에서 조립한다. */
function buildValueSchema(question: QuestionSpec): z.ZodType {
  const base = VALUE_SCHEMA_BUILDERS[question.formType](question);
  // 조건부 문항은 보이는지 여부가 부모 답변에 달려 있어 여기서는 생략을 허용하고,
  // 필수 여부는 `buildAnswerSchema`의 `superRefine`이 부모 답변을 보고 판정한다.
  return question.requiredStatus &&
    question.otherJson?.conditional === undefined
    ? base
    : base.optional();
}

/** 부모 문항의 답변이 `triggerValue(s)` 중 하나이면(다중 선택은 하나라도 포함하면) 보이는 것이다. */
function matchesTrigger(parentAnswer: unknown, triggerValues: string[]) {
  if (typeof parentAnswer === 'string') {
    return triggerValues.includes(parentAnswer);
  }

  return (
    Array.isArray(parentAnswer) &&
    parentAnswer.some(
      (value) => typeof value === 'string' && triggerValues.includes(value),
    )
  );
}

/**
 * 저장된 문항 스펙으로부터, 제출된 답변 전체를 검증할 Zod 스키마를 조립한다.
 *
 * 문항 id(숫자)를 문자열 키로 써서 `{ [questionId]: value }` 형태를 기대한다 — v1은 문항
 * 제목 문자열을 키로 썼는데, 문항명을 바꾸면 과거 데이터와 연결이 끊기는 문제가 있었다.
 * id는 문항을 통째로 교체하지 않는 한 안정적이므로 이쪽이 더 안전한 키다.
 *
 * 다만 폼/설문의 수정 자체가 문항을 전부 지우고 새로 만드는 방식이라(각 서비스의
 * `update()` 참고), 메타데이터만 바꾸는 수정에도 이 id는 매번 바뀐다 — 이미 제출된 응답이
 * 옛 id를 가리키고 있다면 연결이 끊긴다. 스펙 버저닝으로 이 문제를 해결하는 건 별도
 * 과제로 남아 있다.
 *
 * `.strict()`로 스펙에 없는 문항 id가 섞여 들어오면 거부한다 — 알 수 없는 키를 조용히
 * 버리지 않는다.
 *
 * 조건부 문항(`otherJson.conditional`)은 부모 문항(`questions[parentIndex]`, 즉 문항 id 오름차순
 * 위치) 답변이 trigger 값에 해당할 때만 보인다. 보이는데 필수인 문항이 비어 있으면 거부하고,
 * 숨겨진 문항에 값이 오면 클라이언트가 숨긴 문항을 보내지 않는 계약을 어긴 것이므로 거부한다.
 * 부모를 찾을 수 없으면(스펙 오류) 보이는 것으로 보고 기존처럼 필수 여부만 따른다.
 */
export function buildAnswerSchema(questions: readonly QuestionSpec[]) {
  const shape = Object.fromEntries(
    questions.map((question) => [
      String(question.id),
      buildValueSchema(question),
    ]),
  );

  return z
    .object(shape)
    .strict()
    .superRefine((answers, context) => {
      for (const question of questions) {
        const conditional = question.otherJson?.conditional;
        if (conditional === undefined) {
          continue;
        }

        const parent = questions[conditional.parentIndex];
        const visible =
          parent === undefined ||
          matchesTrigger(
            (answers as Record<string, unknown>)[String(parent.id)],
            triggerValuesOf(conditional),
          );
        const answered =
          (answers as Record<string, unknown>)[String(question.id)] !==
          undefined;

        if (!answered && visible && question.requiredStatus) {
          context.addIssue({
            code: 'custom',
            path: [String(question.id)],
            message: '필수 문항입니다.',
          });
        } else if (!visible && answered) {
          context.addIssue({
            code: 'custom',
            path: [String(question.id)],
            message: '조건에 해당하지 않아 숨겨진 문항에는 답할 수 없습니다.',
          });
        }
      }
    });
}
