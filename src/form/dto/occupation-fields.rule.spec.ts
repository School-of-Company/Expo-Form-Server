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
    [Occupation.ELEMENTARY_STUDENT]: '초등학생',
    [Occupation.MIDDLE_SCHOOL_STUDENT]: '중학생',
    [Occupation.HIGH_SCHOOL_STUDENT]: '고등학생',
    [Occupation.SCHOOL_STAFF]: '교직원',
    [Occupation.PRE_SERVICE_TEACHER]: '예비교사',
    [Occupation.PARENT]: '보호자/학부모',
    [Occupation.GENERAL]: '일반인',
    [Occupation.TEACHER]: '교사',
  },
  otherJson: null,
  dynamicFormType: DynamicFormType.OCCUPATION,
};

/** 직업 필드가 `dynamicForm`의 1번 위치에 있다고 보고, 교사·교직원일 때 보이도록 조건을 건다. */
const schoolField = {
  title: '소속 학교',
  formType: DynamicFormFieldType.SENTENCE,
  requiredStatus: true,
  jsonData: {},
  otherJson: {
    hasEtc: false,
    conditional: { parentIndex: 1, triggerValues: ['TEACHER', 'SCHOOL_STAFF'] },
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
  it('직업이 교사·교직원일 때만 보이는 소속 학교 필드를 받는다', () => {
    expect(
      errorsOf(formWith([nameField, occupationField, schoolField])),
    ).toEqual([]);
  });

  it('교사·교직원 조건은 순서와 관계없이 받는다', () => {
    const reversed = {
      ...schoolField,
      otherJson: {
        hasEtc: false,
        conditional: {
          parentIndex: 1,
          triggerValues: ['SCHOOL_STAFF', 'TEACHER'],
        },
      },
    };

    expect(errorsOf(formWith([nameField, occupationField, reversed]))).toEqual(
      [],
    );
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
        // 교사만 빼고 나머지는 다 있는 경우
        jsonData: Object.fromEntries(
          Object.entries(occupationField.jsonData).filter(
            ([key]) => key !== 'TEACHER',
          ),
        ),
      },
    ],
    [
      '드롭다운이 아니면',
      { ...occupationField, formType: DynamicFormFieldType.MULTIPLE },
    ],
  ])('직업 필드는 %s 거부한다', (_label, field) => {
    expect(errorsOf(formWith([nameField, field])).join('\n')).toContain(
      '직업 필드는 선택지 키가 ELEMENTARY_STUDENT, MIDDLE_SCHOOL_STUDENT, HIGH_SCHOOL_STUDENT, SCHOOL_STAFF, PRE_SERVICE_TEACHER, PARENT, GENERAL, TEACHER인 드롭다운이어야 합니다.',
    );
  });

  it.each([
    ['직업 필드가 없으면', [nameField, schoolField]],
    [
      '조건이 없으면',
      [nameField, occupationField, { ...schoolField, otherJson: null }],
    ],
    [
      '조건이 교사만이면(교직원 누락)',
      [
        nameField,
        occupationField,
        {
          ...schoolField,
          otherJson: {
            hasEtc: false,
            conditional: { parentIndex: 1, triggerValue: 'TEACHER' },
          },
        },
      ],
    ],
    [
      '조건에 다른 직업이 섞이면',
      [
        nameField,
        occupationField,
        {
          ...schoolField,
          otherJson: {
            hasEtc: false,
            conditional: {
              parentIndex: 1,
              triggerValues: ['TEACHER', 'SCHOOL_STAFF', 'PARENT'],
            },
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
            conditional: {
              parentIndex: 0,
              triggerValues: ['TEACHER', 'SCHOOL_STAFF'],
            },
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
      '소속 학교 필드는 직업 필드가 TEACHER 또는 SCHOOL_STAFF일 때만 보이는 문장형 필드여야 합니다.',
    );
  });

  it('수정 요청에도 같은 규칙이 적용된다', () => {
    const result = updateFormSchema.safeParse(
      formWith([nameField, schoolField]),
    );

    expect(result.success).toBe(false);
  });
});
