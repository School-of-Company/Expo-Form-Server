import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { ApplicationType } from '../entities/application-type.enum.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
import { createFormSchema } from './create-form.request.dto.js';
import { updateFormSchema } from './update-form.request.dto.js';

const base = {
  expoId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  title: '사전 등록 폼',
  informationText: '안내문',
  participantType: ParticipationType.TRAINEE,
  applicationType: ApplicationType.PRE,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-12-31T00:00:00Z',
  dynamicForm: [
    {
      title: '이름',
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
      dynamicFormType: DynamicFormType.NAME,
    },
  ],
};

describe('createFormSchema', () => {
  it('날짜 문자열을 Date로 바꿔서 받는다', () => {
    const parsed = createFormSchema.parse(base);

    expect(parsed.startDate).toBeInstanceOf(Date);
  });

  it('접수 시작일이 종료일보다 늦으면 거부한다', () => {
    expect(() =>
      createFormSchema.parse({
        ...base,
        startDate: '2026-12-31T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });

  it('occupationOpenAt은 생략·null·기간 안 값을 받는다', () => {
    expect(createFormSchema.parse(base).occupationOpenAt).toBeUndefined();
    expect(
      createFormSchema.parse({ ...base, occupationOpenAt: null })
        .occupationOpenAt,
    ).toBeNull();
    expect(
      createFormSchema.parse({
        ...base,
        occupationOpenAt: '2026-10-26T08:30:00+09:00',
      }).occupationOpenAt,
    ).toEqual(new Date('2026-10-25T23:30:00Z'));
  });

  it.each([
    ['시작일과 같으면', '2026-01-01T00:00:00Z'],
    ['종료일과 같으면', '2026-12-31T00:00:00Z'],
    ['기간 밖이면', '2027-01-01T00:00:00Z'],
  ])('occupationOpenAt이 %s 거부한다', (_, occupationOpenAt) => {
    expect(() =>
      createFormSchema.parse({ ...base, occupationOpenAt }),
    ).toThrow();
    expect(() =>
      updateFormSchema.parse({ ...base, occupationOpenAt }),
    ).toThrow();
  });

  it('시작일과 종료일이 같아도 거부한다', () => {
    expect(() =>
      createFormSchema.parse({
        ...base,
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });
});

describe('updateFormSchema', () => {
  it('expoId는 받지 않는다', () => {
    const parsed = updateFormSchema.parse(base);

    expect(parsed).not.toHaveProperty('expoId');
  });

  it('기간 검증은 수정 요청에도 똑같이 적용된다', () => {
    expect(() =>
      updateFormSchema.parse({
        ...base,
        startDate: '2026-12-31T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });
});
