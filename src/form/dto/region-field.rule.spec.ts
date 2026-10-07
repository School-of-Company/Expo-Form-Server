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

const regionField = {
  title: '지역',
  formType: DynamicFormFieldType.REGION,
  requiredStatus: true,
  jsonData: {},
  otherJson: null,
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

describe('지역 필드 검증', () => {
  it('일반 참가자 폼에서 지역 필드를 받는다', () => {
    expect(errorsOf(formWith([nameField, regionField]))).toEqual([]);
  });

  it('교원연수자 폼에서는 쓸 수 없다', () => {
    expect(
      errorsOf(formWith([nameField, regionField], ParticipationType.TRAINEE)),
    ).toContain('지역 필드는 일반 참가자 폼에서만 쓸 수 있습니다.');
  });

  it('지역 필드를 두 개 둘 수 없다', () => {
    expect(errorsOf(formWith([nameField, regionField, regionField]))).toContain(
      '지역 필드는 폼에 하나만 둘 수 있습니다.',
    );
  });

  it('선택지(jsonData)가 있으면 거부한다', () => {
    expect(
      errorsOf(
        formWith([nameField, { ...regionField, jsonData: { '1': '광주' } }]),
      ),
    ).toContain('지역 필드는 선택지(jsonData)를 쓰지 않습니다.');
  });

  it('dynamicFormType이 DEFAULT가 아니면 거부한다', () => {
    expect(
      errorsOf(
        formWith([
          nameField,
          { ...regionField, dynamicFormType: DynamicFormType.SCHOOL },
        ]),
      ),
    ).toContain('지역 필드의 dynamicFormType은 DEFAULT여야 합니다.');
  });

  it('수정 요청에도 같은 규칙이 적용된다', () => {
    expect(
      updateFormSchema.safeParse(formWith([nameField, regionField])).success,
    ).toBe(true);
    expect(
      updateFormSchema.safeParse(
        formWith([nameField, regionField], ParticipationType.TRAINEE),
      ).success,
    ).toBe(false);
  });
});
