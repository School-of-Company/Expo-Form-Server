import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { ApplicationType } from '../entities/application-type.enum.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
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

const phoneField = {
  title: '전화번호',
  formType: DynamicFormFieldType.SENTENCE,
  requiredStatus: true,
  jsonData: {},
  otherJson: null,
  dynamicFormType: DynamicFormType.PHONE_NUMBER,
};

function formWith(
  dynamicForm: unknown[],
  participantType = ParticipationType.STANDARD,
  applicationType = ApplicationType.PRE,
) {
  return {
    title: '신청 폼',
    informationText: '안내문',
    participantType,
    applicationType,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    dynamicForm,
  };
}

const errorsOf = (input: unknown) => {
  const result = createFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

const missing = '신청 폼에는 이름 필드가 정확히 하나 있어야 합니다.';
const invalid =
  '이름 필드는 조건 없이 항상 보이는 필수 문장형 필드여야 합니다.';

describe('이름 필드 검증', () => {
  it.each([
    [ParticipationType.STANDARD, ApplicationType.PRE],
    [ParticipationType.STANDARD, ApplicationType.FIELD],
    [ParticipationType.TRAINEE, ApplicationType.PRE],
    [ParticipationType.TRAINEE, ApplicationType.FIELD],
  ])(
    '%s·%s 폼은 필수 이름 필드가 있으면 받는다',
    (participantType, applicationType) => {
      expect(
        errorsOf(
          formWith([nameField, phoneField], participantType, applicationType),
        ),
      ).toEqual([]);
    },
  );

  it('이름 필드가 없으면 거부한다', () => {
    expect(errorsOf(formWith([phoneField]))).toContain(missing);
  });

  it('필드가 하나도 없어도 거부한다', () => {
    expect(errorsOf(formWith([]))).toContain(missing);
  });

  it('이름 필드가 둘이면 거부한다', () => {
    expect(errorsOf(formWith([nameField, nameField]))).toContain(missing);
  });

  it.each([
    [
      '문장형이 아니면',
      { ...nameField, formType: DynamicFormFieldType.DROPDOWN },
    ],
    ['필수가 아니면', { ...nameField, requiredStatus: false }],
    [
      '조건부로 숨겨질 수 있으면',
      {
        ...nameField,
        otherJson: {
          hasEtc: false,
          conditional: { parentIndex: 1, triggerValue: 'TEACHER' },
        },
      },
    ],
  ])('이름 필드가 %s 거부한다', (_label, field) => {
    expect(errorsOf(formWith([field, phoneField]))).toContain(invalid);
  });

  it('조건 없는 부가 설정(otherJson)은 허용한다', () => {
    expect(
      errorsOf(formWith([{ ...nameField, otherJson: { hasEtc: false } }])),
    ).toEqual([]);
  });

  it('수정 요청에도 같은 규칙이 적용된다', () => {
    expect(updateFormSchema.safeParse(formWith([phoneField])).success).toBe(
      false,
    );
  });
});
