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

const companionField = {
  title: '동반자',
  formType: DynamicFormFieldType.COMPANION,
  requiredStatus: false,
  jsonData: {},
  otherJson: { hasEtc: false, maxSelection: 5 },
  dynamicFormType: DynamicFormType.DEFAULT,
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

describe('동반자 추가 필드 검증', () => {
  it('일반 참가자 폼에서 최대 5명까지 동반자를 받는 필드를 받는다', () => {
    expect(errorsOf(formWith([nameField, companionField]))).toEqual([]);
  });

  it.each([
    ['최대 인원을 안 적어도', { ...companionField, otherJson: null }],
    [
      '최대 인원이 1명이어도',
      { ...companionField, otherJson: { hasEtc: false, maxSelection: 1 } },
    ],
  ])('%s 받는다', (_label, field) => {
    expect(errorsOf(formWith([nameField, field]))).toEqual([]);
  });

  it('교원연수자 폼에서는 쓸 수 없다', () => {
    expect(
      errorsOf(
        formWith([nameField, companionField], ParticipationType.TRAINEE),
      ),
    ).toContain('동반자 필드는 일반 참가자 폼에서만 쓸 수 있습니다.');
  });

  it('동반자 필드를 두 개 둘 수 없다', () => {
    expect(
      errorsOf(formWith([nameField, companionField, companionField])),
    ).toContain('동반자 필드는 폼에 하나만 둘 수 있습니다.');
  });

  it('최대 인원이 5명을 넘으면 거부한다', () => {
    expect(
      errorsOf(
        formWith([
          nameField,
          { ...companionField, otherJson: { hasEtc: false, maxSelection: 6 } },
        ]),
      ),
    ).toContain('동반자는 최대 5명까지 추가할 수 있습니다.');
  });

  it('선택지(jsonData)가 있으면 거부한다', () => {
    expect(
      errorsOf(
        formWith([nameField, { ...companionField, jsonData: { '1': '선택' } }]),
      ),
    ).toContain('동반자 필드는 선택지(jsonData)를 쓰지 않습니다.');
  });

  it('dynamicFormType이 DEFAULT가 아니면 거부한다', () => {
    expect(
      errorsOf(
        formWith([
          nameField,
          { ...companionField, dynamicFormType: DynamicFormType.SCHOOL },
        ]),
      ),
    ).toContain('동반자 필드의 dynamicFormType은 DEFAULT여야 합니다.');
  });

  it('수정 요청에도 같은 규칙이 적용된다', () => {
    expect(
      updateFormSchema.safeParse(formWith([nameField, companionField])).success,
    ).toBe(true);
    expect(
      updateFormSchema.safeParse(
        formWith([nameField, companionField, companionField]),
      ).success,
    ).toBe(false);
  });
});
