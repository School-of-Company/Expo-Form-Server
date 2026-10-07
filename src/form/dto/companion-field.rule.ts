import type { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { COMPANION_MAX_COUNT } from '../../json/companion.js';
import type { JsonData, OtherJson } from '../../json/field-spec.schema.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';

type FormLike = {
  participantType: ParticipationType;
  dynamicForm: Array<{
    formType: DynamicFormFieldType;
    jsonData: JsonData;
    otherJson: OtherJson | null;
    dynamicFormType: DynamicFormType;
  }>;
};

/**
 * 동반자 추가(`COMPANION`) 필드가 신청 처리 쪽이 읽을 수 있는 모양인지 검증한다.
 *
 * - 일반 참가자(`STANDARD`) 폼에서만, 폼당 하나
 * - 최대 인원(`otherJson.maxSelection`)은 {@link COMPANION_MAX_COUNT}명을 넘을 수 없다
 * - 선택지(`jsonData`)를 쓰지 않고, 신청 처리 쪽이 따로 읽는 의미 있는 필드(`NAME` 등)가 아니다
 */
export function checkCompanionField(
  form: FormLike,
  ctx: z.RefinementCtx,
): void {
  const indexes = form.dynamicForm.flatMap((field, index) =>
    field.formType === DynamicFormFieldType.COMPANION ? [index] : [],
  );
  if (indexes.length === 0) {
    return;
  }

  const issue = (message: string, index?: number) => {
    ctx.addIssue({
      code: 'custom',
      message,
      path: index === undefined ? ['dynamicForm'] : ['dynamicForm', index],
    });
  };

  if (form.participantType !== ParticipationType.STANDARD) {
    issue('동반자 필드는 일반 참가자 폼에서만 쓸 수 있습니다.', indexes[0]);
    return;
  }

  if (indexes.length > 1) {
    issue('동반자 필드는 폼에 하나만 둘 수 있습니다.');
    return;
  }

  const [index] = indexes;
  const field = form.dynamicForm[index];
  if ((field.otherJson?.maxSelection ?? 0) > COMPANION_MAX_COUNT) {
    issue(
      `동반자는 최대 ${COMPANION_MAX_COUNT}명까지 추가할 수 있습니다.`,
      index,
    );
  }

  if (Object.keys(field.jsonData).length > 0) {
    issue('동반자 필드는 선택지(jsonData)를 쓰지 않습니다.', index);
  }

  if (field.dynamicFormType !== DynamicFormType.DEFAULT) {
    issue('동반자 필드의 dynamicFormType은 DEFAULT여야 합니다.', index);
  }
}
