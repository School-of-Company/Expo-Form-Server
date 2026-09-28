import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { createSurveySchema } from './create-survey.request.dto.js';
import { updateSurveySchema } from './update-survey.request.dto.js';

const base = {
  expoId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  title: '행사 만족도 설문',
  informationText: '안내문',
  participationType: ParticipationType.TRAINEE,
  dynamicSurvey: [
    {
      title: '만족도',
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '만족', '2': '불만족' },
      otherJson: null,
    },
  ],
};

describe('createSurveySchema', () => {
  it('선택지 스펙이 어긋난 문항은 거부한다', () => {
    expect(() =>
      createSurveySchema.parse({
        ...base,
        dynamicSurvey: [{ ...base.dynamicSurvey[0], jsonData: { '1': 123 } }],
      }),
    ).toThrow();
  });

  it('부가 설정이 없는 문항은 otherJson에 null을 허용한다', () => {
    const parsed = createSurveySchema.parse(base);

    expect(parsed.dynamicSurvey[0].otherJson).toBeNull();
  });

  it('누적 응답 수는 요청으로 받지 않는다', () => {
    const parsed = createSurveySchema.parse({ ...base, totalAnswers: 99 });

    expect(parsed).not.toHaveProperty('totalAnswers');
  });
});

describe('updateSurveySchema', () => {
  it('expoId는 받지 않는다', () => {
    const parsed = updateSurveySchema.parse(base);

    expect(parsed).not.toHaveProperty('expoId');
  });
});
