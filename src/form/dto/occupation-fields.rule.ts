import type { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import {
  type JsonData,
  type OtherJson,
  triggerValuesOf,
} from '../../json/field-spec.schema.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
import {
  Occupation,
  SCHOOL_OCCUPATIONS,
} from '../../common/enums/occupation.enum.js';

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

const schoolOccupations: string[] = [...SCHOOL_OCCUPATIONS];

/**
 * 직업(`OCCUPATION`)·소속 학교(`SCHOOL`) 필드가 신청 처리 쪽이 읽을 수 있는 모양인지 검증한다.
 *
 * - 일반 참가자 폼은 직업·소속 학교를 각각 최대 하나
 * - 교원연수자 폼은 소속 학교만 받는다(최대 하나). 연수자는 모두 교사라 직업은 묻지 않고, 소속 학교는
 *   조건 없이 항상 보이는 문장형 필드다 — 명찰에 소속을 찍으려면 반드시 받아야 하기 때문이다
 * - 일반 참가자 폼의 직업은 드롭다운이고 선택지 키가 {@link Occupation} 값과 정확히 같다 — 키가 고정돼야 답변 값으로
 *   학생·교사를 알아본다
 * - 일반 참가자 폼의 소속 학교는 직업 필드가 있어야 하고, 문장형이며, 직업이 교사·예비교사일 때만 보이는
 *   조건부 필드다(`otherJson.conditional.parentIndex`는 `dynamicForm` 안의 위치다)
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

  if (form.participantType === ParticipationType.TRAINEE) {
    checkTraineeFields(form, occupationIndexes, schoolIndexes, issue);
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
  const triggers =
    conditional === undefined ? [] : triggerValuesOf(conditional).toSorted();
  if (
    occupationIndex === undefined ||
    school.formType !== DynamicFormFieldType.SENTENCE ||
    conditional?.parentIndex !== occupationIndex ||
    triggers.join(',') !== schoolOccupations.toSorted().join(',')
  ) {
    issue(
      `소속 학교 필드는 직업 필드가 ${schoolOccupations.join(', ')} 중 하나일 때만 보이는 문장형 필드여야 합니다.`,
      schoolIndex,
    );
  }
}

/**
 * 교원연수자 폼의 직업·소속 학교 필드를 검증한다. 직업은 일반 참가자만 받고, 소속 학교는 하나만
 * 문장형으로, 조건 없이 항상 보이게 받는다.
 */
function checkTraineeFields(
  form: FormLike,
  occupationIndexes: number[],
  schoolIndexes: number[],
  issue: (message: string, index?: number) => void,
): void {
  for (const index of occupationIndexes) {
    issue('직업 필드는 일반 참가자 폼에서만 쓸 수 있습니다.', index);
  }

  if (schoolIndexes.length > 1) {
    issue('소속 학교 필드는 폼에 하나만 둘 수 있습니다.');
    return;
  }

  const [schoolIndex] = schoolIndexes;
  if (schoolIndex === undefined) {
    return;
  }

  const school = form.dynamicForm[schoolIndex];
  if (
    school.formType !== DynamicFormFieldType.SENTENCE ||
    school.otherJson?.conditional !== undefined
  ) {
    issue(
      '교원연수자 폼의 소속 학교 필드는 조건 없이 항상 보이는 문장형 필드여야 합니다.',
      schoolIndex,
    );
  }
}
