import type { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import {
  type JsonData,
  type OtherJson,
  triggerValuesOf,
} from '../../json/field-spec.schema.js';

type FormLike = {
  dynamicForm: Array<{
    title: string;
    formType: DynamicFormFieldType;
    jsonData: JsonData;
    otherJson: OtherJson | null;
  }>;
};

/** 선택지를 가진 필드 유형. 조건부 표시의 부모가 될 수 있는 것도 이쪽뿐이다. */
const CHOICE_TYPES: ReadonlySet<DynamicFormFieldType> = new Set([
  DynamicFormFieldType.DROPDOWN,
  DynamicFormFieldType.MULTIPLE,
]);

/** 신청 폼 전용 필드 유형. 프로그램용 폼에서는 쓰지 않는다. */
const REGISTRATION_ONLY_TYPES: ReadonlySet<DynamicFormFieldType> = new Set([
  DynamicFormFieldType.COMPANION,
  DynamicFormFieldType.REGION,
]);

/**
 * 프로그램용 폼의 필드 구성이 답변을 받을 수 있는 모양인지 검증한다. 등록용과 달리 특정 필드를 강제하지
 * 않고, 관리자가 정한 구성이 스스로 어긋나지 않는지만 본다.
 *
 * - 필드 제목은 폼 안에서 겹치지 않는다 — 신청 답변이 문항 제목을 키로 쓰므로 겹치면 답변이 섞인다
 * - 동반자·지역 필드는 신청 폼 전용이라 쓰지 않는다
 * - 드롭다운·다중 선택은 선택지가 하나 이상이고, 그 밖의 유형은 선택지(`jsonData`)를 쓰지 않는다
 * - 조건부 표시(`otherJson.conditional`)의 부모는 자기보다 앞에 있는 선택지형 필드이고, 반응하는 값은 그
 *   부모의 선택지 키여야 한다
 */
export function checkProgramFormFields(
  form: FormLike,
  ctx: z.RefinementCtx,
): void {
  const issue = (message: string, index: number) => {
    ctx.addIssue({ code: 'custom', message, path: ['dynamicForm', index] });
  };

  const seenTitles = new Set<string>();
  for (const [index, field] of form.dynamicForm.entries()) {
    if (seenTitles.has(field.title)) {
      issue('필드 제목이 겹칩니다.', index);
    }

    seenTitles.add(field.title);

    if (REGISTRATION_ONLY_TYPES.has(field.formType)) {
      issue('동반자·지역 필드는 신청 폼에서만 쓸 수 있습니다.', index);
    }

    const optionCount = Object.keys(field.jsonData).length;
    if (optionCount === 0 && CHOICE_TYPES.has(field.formType)) {
      issue('선택지가 하나 이상 있어야 합니다.', index);
    }

    if (optionCount > 0 && !CHOICE_TYPES.has(field.formType)) {
      issue('이 유형의 필드는 선택지(jsonData)를 쓰지 않습니다.', index);
    }

    checkConditional(form, field, index, issue);
  }
}

function checkConditional(
  form: FormLike,
  field: FormLike['dynamicForm'][number],
  index: number,
  issue: (message: string, index: number) => void,
): void {
  const conditional = field.otherJson?.conditional;
  if (conditional === undefined) {
    return;
  }

  const parent = form.dynamicForm[conditional.parentIndex] as
    FormLike['dynamicForm'][number] | undefined;
  if (parent === undefined || conditional.parentIndex >= index) {
    issue('조건부 표시의 기준 필드는 자기보다 앞에 있어야 합니다.', index);
    return;
  }

  if (!CHOICE_TYPES.has(parent.formType)) {
    issue('조건부 표시의 기준 필드는 선택지형이어야 합니다.', index);
    return;
  }

  const options = Object.keys(parent.jsonData);
  if (triggerValuesOf(conditional).some((value) => !options.includes(value))) {
    issue('조건부 표시가 기준 필드에 없는 선택지를 가리킵니다.', index);
  }
}
