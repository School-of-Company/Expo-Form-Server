import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { ApplicationType } from '../entities/application-type.enum.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
import { Occupation } from '../entities/occupation.enum.js';
import { createFormSchema } from './create-form.request.dto.js';
import { updateFormSchema } from './update-form.request.dto.js';

const nameField = {
  title: '이름',
  formType: DynamicFormFieldType.SENTENCE,
  requiredStatus: true,
  jsonData: {},
  otherJson: null,
  dynamicFormType: DynamicFormType.NAME,
};

const occupationField = {
  title: '직업',
  formType: DynamicFormFieldType.DROPDOWN,
  requiredStatus: true,
  jsonData: {
    [Occupation.TEACHER]: '교사',
    [Occupation.STUDENT]: '학생',
    [Occupation.GENERAL]: '일반',
  },
  otherJson: null,
  dynamicFormType: DynamicFormType.OCCUPATION,
};

/** 직업 필드가 `dynamicForm`의 1번 위치에 있다고 보고 조건을 건다. */
const schoolField = {
  title: '소속 학교',
  formType: DynamicFormFieldType.SENTENCE,
  requiredStatus: true,
  jsonData: {},
  otherJson: {
    hasEtc: false,
    conditional: { parentIndex: 1, triggerValue: 'TEACHER' },
  },
  dynamicFormType: DynamicFormType.SCHOOL,
};

function formWith(
  dynamicForm: unknown[],
  participantType = ParticipationType.STANDARD,
) {
  return {
    title: '사전 등록 폼',
    informationText: '안내문',
    participantType,
    applicationType: ApplicationType.PRE,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    dynamicForm,
  };
}

const errorsOf = (input: unknown) => {
  const result = createFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('직업·소속 학교 필드 검증', () => {
  it('직업이 교사일 때만 보이는 소속 학교 필드를 받는다', () => {
    expect(
      errorsOf(formWith([nameField, occupationField, schoolField])),
    ).toEqual([]);
  });

  it('소속 학교 없이 직업 필드만 있어도 된다', () => {
    expect(errorsOf(formWith([nameField, occupationField]))).toEqual([]);
  });

  it('교원연수자 폼에서는 쓸 수 없다', () => {
    expect(
      errorsOf(
        formWith(
          [nameField, occupationField, schoolField],
          ParticipationType.TRAINEE,
        ),
      ),
    ).toContain('직업·소속 학교 필드는 일반 참가자 폼에서만 쓸 수 있습니다.');
  });

  it('직업 필드를 두 개 둘 수 없다', () => {
    expect(
      errorsOf(formWith([nameField, occupationField, occupationField])),
    ).toContain('직업·소속 학교 필드는 폼에 하나씩만 둘 수 있습니다.');
  });

  it.each([
    [
      '선택지 키가 순번이면',
      { ...occupationField, jsonData: { 1: '교사', 2: '학생', 3: '일반' } },
    ],
    [
      '직업 값이 빠지면',
      {
        ...occupationField,
        jsonData: {
          [Occupation.TEACHER]: '교사',
          [Occupation.STUDENT]: '학생',
        },
      },
    ],
    [
      '드롭다운이 아니면',
      { ...occupationField, formType: DynamicFormFieldType.MULTIPLE },
    ],
  ])('직업 필드는 %s 거부한다', (_label, field) => {
    expect(errorsOf(formWith([nameField, field])).join('\n')).toContain(
      '직업 필드는 선택지 키가 TEACHER, STUDENT, GENERAL인 드롭다운이어야 합니다.',
    );
  });

  it.each([
    ['직업 필드가 없으면', [nameField, schoolField]],
    [
      '조건이 없으면',
      [nameField, occupationField, { ...schoolField, otherJson: null }],
    ],
    [
      '조건이 교사가 아니면',
      [
        nameField,
        occupationField,
        {
          ...schoolField,
          otherJson: {
            hasEtc: false,
            conditional: { parentIndex: 1, triggerValue: 'STUDENT' },
          },
        },
      ],
    ],
    [
      '조건이 직업 필드가 아닌 다른 필드를 가리키면',
      [
        nameField,
        occupationField,
        {
          ...schoolField,
          otherJson: {
            hasEtc: false,
            conditional: { parentIndex: 0, triggerValue: 'TEACHER' },
          },
        },
      ],
    ],
    [
      '문장형이 아니면',
      [
        nameField,
        occupationField,
        { ...schoolField, formType: DynamicFormFieldType.DROPDOWN },
      ],
    ],
  ])('소속 학교 필드는 %s 거부한다', (_label, fields) => {
    expect(errorsOf(formWith(fields))).toContain(
      '소속 학교 필드는 직업 필드가 TEACHER일 때만 보이는 문장형 필드여야 합니다.',
    );
  });

  it('수정 요청에도 같은 규칙이 적용된다', () => {
    const result = updateFormSchema.safeParse(
      formWith([nameField, schoolField]),
    );

    expect(result.success).toBe(false);
  });
});
