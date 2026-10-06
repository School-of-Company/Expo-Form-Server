import type { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import type { OtherJson } from '../../json/field-spec.schema.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';

type FormLike = {
  dynamicForm: Array<{
    formType: DynamicFormFieldType;
    requiredStatus: boolean;
    otherJson: OtherJson | null;
    dynamicFormType: DynamicFormType;
  }>;
};

/**
 * 모든 신청 폼은 신청자 이름을 받아야 한다. 신청 처리 쪽이 이름 필드(`NAME`)를 직접 읽으므로
 * 정확히 하나, 필수 문장형이어야 하고, 항상 보여야 하므로 조건부 표시가 없어야 한다.
 */
export function checkNameField(form: FormLike, ctx: z.RefinementCtx): void {
  const nameIndexes = form.dynamicForm.flatMap((field, index) =>
    field.dynamicFormType === DynamicFormType.NAME ? [index] : [],
  );

  if (nameIndexes.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      message: '신청 폼에는 이름 필드가 정확히 하나 있어야 합니다.',
      path: ['dynamicForm'],
    });
    return;
  }

  const [nameIndex] = nameIndexes;
  const name = form.dynamicForm[nameIndex];
  if (
    name.formType !== DynamicFormFieldType.SENTENCE ||
    !name.requiredStatus ||
    name.otherJson?.conditional !== undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      message: '이름 필드는 조건 없이 항상 보이는 필수 문장형 필드여야 합니다.',
      path: ['dynamicForm', nameIndex],
    });
  }
}
