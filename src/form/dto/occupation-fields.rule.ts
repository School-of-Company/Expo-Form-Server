import type { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import type { JsonData, OtherJson } from '../../json/field-spec.schema.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
import { Occupation } from '../entities/occupation.enum.js';

type FieldLike = {
  formType: DynamicFormFieldType;
  jsonData: JsonData;
  otherJson: OtherJson | null;
  dynamicFormType: DynamicFormType;
};

type FormLike = {
  participantType: ParticipationType;
  dynamicForm: FieldLike[];
};

const occupationValues = Object.values(Occupation) as string[];

/** 소속 학교 필드를 보여 줄 직업 값. 조건의 `triggerValue`(문자열)와 비교한다. */
const teacher: string = Occupation.TEACHER;

/**
 * 직업(`OCCUPATION`)·소속 학교(`SCHOOL`) 필드가 신청 처리 쪽이 읽을 수 있는 모양인지 검증한다.
 *
 * - 일반 참가자 폼에서만, 각각 최대 하나
 * - 직업은 드롭다운이고 선택지 키가 {@link Occupation} 값과 정확히 같다 — 키가 고정돼야 답변 값으로
 *   교사를 알아본다
 * - 소속 학교는 직업 필드가 있어야 하고, 문장형이며, 직업이 `TEACHER`일 때만 보이는 조건부 필드다
 *   (`otherJson.conditional.parentIndex`는 `dynamicForm` 안의 위치다)
 */
export function checkOccupationFields(
  form: FormLike,
  ctx: z.RefinementCtx,
): void {
  const indexesOf = (type: DynamicFormType) =>
    form.dynamicForm.flatMap((field, index) =>
      field.dynamicFormType === type ? [index] : [],
    );
  const occupationIndexes = indexesOf(DynamicFormType.OCCUPATION);
  const schoolIndexes = indexesOf(DynamicFormType.SCHOOL);
  if (occupationIndexes.length === 0 && schoolIndexes.length === 0) {
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
    issue('직업·소속 학교 필드는 일반 참가자 폼에서만 쓸 수 있습니다.');
    return;
  }

  if (occupationIndexes.length > 1 || schoolIndexes.length > 1) {
    issue('직업·소속 학교 필드는 폼에 하나씩만 둘 수 있습니다.');
    return;
  }

  const [occupationIndex] = occupationIndexes;
  if (occupationIndex !== undefined) {
    const occupation = form.dynamicForm[occupationIndex];
    const keys = Object.keys(occupation.jsonData).toSorted();
    if (
      occupation.formType !== DynamicFormFieldType.DROPDOWN ||
      keys.join(',') !== occupationValues.toSorted().join(',')
    ) {
      issue(
        `직업 필드는 선택지 키가 ${occupationValues.join(', ')}인 드롭다운이어야 합니다.`,
        occupationIndex,
      );
    }
  }

  const [schoolIndex] = schoolIndexes;
  if (schoolIndex === undefined) {
    return;
  }

  const school = form.dynamicForm[schoolIndex];
  const conditional = school.otherJson?.conditional;
  if (
    occupationIndex === undefined ||
    school.formType !== DynamicFormFieldType.SENTENCE ||
    conditional?.parentIndex !== occupationIndex ||
    conditional.triggerValue !== teacher
  ) {
    issue(
      '소속 학교 필드는 직업 필드가 TEACHER일 때만 보이는 문장형 필드여야 합니다.',
      schoolIndex,
    );
  }
}
