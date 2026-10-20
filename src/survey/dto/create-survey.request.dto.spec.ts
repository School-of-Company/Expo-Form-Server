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
  dynamicSurveyRequestDto: [
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
  it.each([
    [
      DynamicFormFieldType.COMPANION,
      '동반자 필드는 신청 폼에서만 쓸 수 있습니다.',
    ],
    [DynamicFormFieldType.REGION, '지역 필드는 신청 폼에서만 쓸 수 있습니다.'],
  ])('신청 폼 전용 문항(%s)은 설문에 쓸 수 없다', (formType, message) => {
    const question = {
      title: '신청 폼 전용',
      formType,
      requiredStatus: false,
      jsonData: {},
      otherJson: null,
    };
    const body = {
      ...base,
      dynamicSurveyRequestDto: [...base.dynamicSurveyRequestDto, question],
    };

    const result = createSurveySchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      message,
    );
    expect(updateSurveySchema.safeParse(body).success).toBe(false);
  });

  it('선택지 스펙이 어긋난 문항은 거부한다', () => {
    expect(() =>
      createSurveySchema.parse({
        ...base,
        dynamicSurveyRequestDto: [
          { ...base.dynamicSurveyRequestDto[0], jsonData: { '1': 123 } },
        ],
      }),
    ).toThrow();
  });

  it('부가 설정이 없는 문항은 otherJson에 null을 허용한다', () => {
    const parsed = createSurveySchema.parse(base);

    expect(parsed.dynamicSurveyRequestDto[0].otherJson).toBeNull();
  });

  it('누적 응답 수는 요청으로 받지 않는다', () => {
    const parsed = createSurveySchema.parse({ ...base, totalAnswers: 99 });

    expect(parsed).not.toHaveProperty('totalAnswers');
  });
});

describe('문항 정의 검증', () => {
  const withQuestions = (...questions: Array<Record<string, unknown>>) => ({
    ...base,
    dynamicSurveyRequestDto: questions,
  });
  const question = (overrides: Record<string, unknown> = {}) => ({
    title: '문항',
    formType: DynamicFormFieldType.DROPDOWN,
    requiredStatus: true,
    jsonData: { '1': '가', '2': '나' },
    otherJson: null,
    ...overrides,
  });
  const messages = (body: unknown) =>
    createSurveySchema
      .safeParse(body)
      .error?.issues.map((issue) => issue.message) ?? [];

  it.each([DynamicFormFieldType.DROPDOWN, DynamicFormFieldType.MULTIPLE])(
    '선택지가 없는 필수 %s는 거부한다',
    (formType) => {
      const body = withQuestions(question({ formType, jsonData: {} }));

      expect(messages(body)).toContain(
        '필수 선택 문항은 선택지가 하나 이상 있어야 합니다.',
      );
      expect(updateSurveySchema.safeParse(body).success).toBe(false);
    },
  );

  it('선택지가 없어도 필수가 아니거나 선택지형이 아니면 허용한다', () => {
    expect(
      createSurveySchema.safeParse(
        withQuestions(
          question({ requiredStatus: false, jsonData: {} }),
          question({ formType: DynamicFormFieldType.SENTENCE, jsonData: {} }),
        ),
      ).success,
    ).toBe(true);
  });

  it('기존 설문에서 허용하던 제목 중복과 이미지 문항은 계속 허용한다', () => {
    expect(
      createSurveySchema.safeParse(
        withQuestions(
          question({ title: '같은 제목' }),
          question({ title: '같은 제목' }),
          question({
            formType: DynamicFormFieldType.IMAGE,
            requiredStatus: false,
            jsonData: {},
          }),
        ),
      ).success,
    ).toBe(true);
  });

  it('기타 입력(hasEtc)은 거부한다', () => {
    expect(
      messages(withQuestions(question({ otherJson: { hasEtc: true } }))),
    ).toContain('기타 입력은 설문에서 아직 쓸 수 없습니다.');
  });

  describe('조건부 표시', () => {
    const conditional = (parentIndex: number, triggerValue = '1') => ({
      hasEtc: false,
      conditional: { parentIndex, triggerValue },
    });

    it('앞에 있는 선택지형 문항을 기준으로 하면 허용한다', () => {
      expect(
        createSurveySchema.safeParse(
          withQuestions(
            question(),
            question({
              formType: DynamicFormFieldType.SENTENCE,
              jsonData: {},
              otherJson: conditional(0),
            }),
          ),
        ).success,
      ).toBe(true);
    });

    it.each([
      ['범위를 벗어난 parentIndex', 5],
      ['자기 자신을 가리키는 parentIndex', 1],
    ])('%s는 거부한다', (_, parentIndex) => {
      expect(
        messages(
          withQuestions(
            question(),
            question({ otherJson: conditional(parentIndex) }),
          ),
        ),
      ).toContain('조건부 표시의 기준 필드는 자기보다 앞에 있어야 합니다.');
    });

    it('선택지형이 아닌 기준 문항은 거부한다', () => {
      expect(
        messages(
          withQuestions(
            question({
              formType: DynamicFormFieldType.SENTENCE,
              jsonData: {},
            }),
            question({ otherJson: conditional(0) }),
          ),
        ),
      ).toContain('조건부 표시의 기준 필드는 선택지형이어야 합니다.');
    });

    it('기준 문항에 없는 선택지를 가리키면 거부한다', () => {
      expect(
        messages(
          withQuestions(
            question(),
            question({ otherJson: conditional(0, '9') }),
          ),
        ),
      ).toContain('조건부 표시가 기준 필드에 없는 선택지를 가리킵니다.');
    });
  });
});

describe('updateSurveySchema', () => {
  it('expoId는 받지 않는다', () => {
    const parsed = updateSurveySchema.parse(base);

    expect(parsed).not.toHaveProperty('expoId');
  });
});
