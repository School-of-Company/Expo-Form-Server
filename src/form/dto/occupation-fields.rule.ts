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

/**
 * 폼 선택지에서 생략해도 되는 직업. 새 신청 선택지에서는 숨기지만(교직원은 교원 `TEACHER`로 신청),
 * 이미 저장된 폼과 답변·다른 서비스의 값 계약을 위해 enum에는 남기고 키를 넣은 폼도 계속 허용한다.
 */
const optionalOccupations: string[] = [Occupation.SCHOOL_STAFF];

const requiredOccupationValues = occupationValues.filter(
  (value) => !optionalOccupations.includes(value),
);

const schoolOccupations: string[] = [...SCHOOL_OCCUPATIONS];

/**
 * 직업(`OCCUPATION`)·소속 학교(`SCHOOL`) 필드가 신청 처리 쪽이 읽을 수 있는 모양인지 검증한다.
 *
 * - 일반 참가자 폼은 직업·소속 학교를 각각 최대 하나
 * - 교원연수자 폼은 소속 학교만 받는다(최대 하나). 연수자는 모두 교사라 직업은 묻지 않고, 소속 학교는
 *   조건 없이 항상 보이는 문장형 필드다 — 명찰에 소속을 찍으려면 반드시 받아야 하기 때문이다
 * - 일반 참가자 폼의 직업은 드롭다운이고 선택지 키가 {@link Occupation} 값과 같다(교직원 `SCHOOL_STAFF`만 생략 가능) — 키가 고정돼야 답변 값으로
 *   학생·교사를 알아본다
 * - 일반 참가자 폼의 소속 학교는 직업 필드가 있어야 하고, 문장형이며, 직업이 교사·예비교사일
 *   때만 보이는 조건부 필드다(`otherJson.conditional.parentIndex`는 `dynamicForm` 안의 위치다)
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
    const keys = Object.keys(occupation.jsonData);
    if (
      occupation.formType !== DynamicFormFieldType.DROPDOWN ||
      !hasOccupationKeys(keys)
    ) {
      issue(
        `직업 필드는 선택지 키가 ${requiredOccupationValues.join(', ')}(교직원 ${optionalOccupations.join(', ')}은 생략 가능)인 드롭다운이어야 합니다.`,
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

/** 필수 직업 키가 모두 있고, 그 밖에는 생략 가능한 직업 키만 있어야 한다. */
function hasOccupationKeys(keys: string[]): boolean {
  return (
    requiredOccupationValues.every((value) => keys.includes(value)) &&
    keys.every((key) => occupationValues.includes(key))
  );
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
