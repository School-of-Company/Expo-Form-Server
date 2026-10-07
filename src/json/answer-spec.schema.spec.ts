import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { buildAnswerSchema, type QuestionSpec } from './answer-spec.schema.js';

const sentenceQuestion = {
  id: 1,
  formType: DynamicFormFieldType.SENTENCE,
  requiredStatus: true,
  jsonData: {},
  otherJson: null,
} satisfies QuestionSpec;

const dropdownQuestion = {
  id: 2,
  formType: DynamicFormFieldType.DROPDOWN,
  requiredStatus: true,
  jsonData: { '1': '만족', '2': '불만족' },
  otherJson: null,
} satisfies QuestionSpec;

const optionalCheckboxQuestion = {
  id: 3,
  formType: DynamicFormFieldType.CHECKBOX,
  requiredStatus: false,
  jsonData: {},
  otherJson: null,
} satisfies QuestionSpec;

const boundedMultipleQuestion = {
  id: 4,
  formType: DynamicFormFieldType.MULTIPLE,
  requiredStatus: true,
  jsonData: { '1': '아침', '2': '점심', '3': '저녁' },
  otherJson: { hasEtc: false, maxSelection: 2 },
} satisfies QuestionSpec;

describe('buildAnswerSchema', () => {
  it('빈 문자열 문장형 답변은 거부한다', () => {
    const schema = buildAnswerSchema([sentenceQuestion]);

    expect(() => schema.parse({ '1': '' })).toThrow();
  });

  it('문장형 답변을 그대로 받는다', () => {
    const schema = buildAnswerSchema([sentenceQuestion]);

    expect(schema.parse({ '1': '좋았습니다' })).toEqual({ '1': '좋았습니다' });
  });

  it('드롭다운 답변이 jsonData 키 중 하나가 아니면 거부한다', () => {
    const schema = buildAnswerSchema([dropdownQuestion]);

    expect(() => schema.parse({ '2': '3' })).toThrow();
  });

  it('드롭다운 답변이 jsonData 키 중 하나면 받는다', () => {
    const schema = buildAnswerSchema([dropdownQuestion]);

    expect(schema.parse({ '2': '1' })).toEqual({ '2': '1' });
  });

  it('필수가 아닌 문항은 값을 안 보내도 된다', () => {
    const schema = buildAnswerSchema([optionalCheckboxQuestion]);

    expect(schema.parse({})).toEqual({});
  });

  it('체크박스는 불리언만 받는다', () => {
    const schema = buildAnswerSchema([optionalCheckboxQuestion]);

    expect(() => schema.parse({ '3': 'true' })).toThrow();
    expect(schema.parse({ '3': true })).toEqual({ '3': true });
  });

  it('다중 선택이 maxSelection을 넘으면 거부한다', () => {
    const schema = buildAnswerSchema([boundedMultipleQuestion]);

    expect(() => schema.parse({ '4': ['1', '2', '3'] })).toThrow();
  });

  it('다중 선택이 maxSelection 이내면 받는다', () => {
    const schema = buildAnswerSchema([boundedMultipleQuestion]);

    expect(schema.parse({ '4': ['1', '2'] })).toEqual({ '4': ['1', '2'] });
  });

  it('필수 문항이 빠지면 거부한다', () => {
    const schema = buildAnswerSchema([sentenceQuestion, dropdownQuestion]);

    expect(() => schema.parse({ '1': '좋았습니다' })).toThrow();
  });

  it('스펙에 없는 문항 id가 섞여 있으면 거부한다', () => {
    const schema = buildAnswerSchema([sentenceQuestion]);

    expect(() =>
      schema.parse({ '1': '좋았습니다', '999': '알 수 없는 답변' }),
    ).toThrow();
  });

  describe('동반자 추가(COMPANION)', () => {
    const companionQuestion = {
      id: 5,
      formType: DynamicFormFieldType.COMPANION,
      requiredStatus: false,
      jsonData: {},
      otherJson: null,
    } satisfies QuestionSpec;
    const person = (n: number) => ({
      name: `동반자${n}`,
      occupation: 'TEACHER',
      region: 'GWANGJU',
      school: '○○초등학교',
    });
    const people = (count: number) =>
      Array.from({ length: count }, (_, index) => person(index + 1));

    it('이름·구분·지역이 있는 동반자 목록을 받는다', () => {
      const schema = buildAnswerSchema([companionQuestion]);

      expect(schema.safeParse({ '5': people(2) }).success).toBe(true);
    });

    it('최대 4명까지 받고 5명부터는 거부한다', () => {
      const schema = buildAnswerSchema([companionQuestion]);

      expect(schema.safeParse({ '5': people(4) }).success).toBe(true);
      expect(schema.safeParse({ '5': people(5) }).success).toBe(false);
    });

    it('otherJson.maxSelection이 있으면 그 인원까지만 받는다', () => {
      const schema = buildAnswerSchema([
        { ...companionQuestion, otherJson: { hasEtc: false, maxSelection: 2 } },
      ]);

      expect(schema.safeParse({ '5': people(2) }).success).toBe(true);
      expect(schema.safeParse({ '5': people(3) }).success).toBe(false);
    });

    it('maxSelection이 상한보다 커도 4명을 넘을 수 없다', () => {
      const schema = buildAnswerSchema([
        { ...companionQuestion, otherJson: { hasEtc: false, maxSelection: 9 } },
      ]);

      expect(schema.safeParse({ '5': people(5) }).success).toBe(false);
    });

    it.each([
      ['이름이 비면', { ...person(1), name: '  ' }],
      ['구분이 빠지면', { ...person(1), occupation: undefined }],
      ['모르는 구분이면', { ...person(1), occupation: 'ALIEN' }],
      ['지역이 빠지면', { ...person(1), region: undefined }],
      ['모르는 지역이면', { ...person(1), region: '서울' }],
      ['이름이 10자를 넘으면', { ...person(1), name: '가'.repeat(11) }],
      [
        '소속이 필요한 구분인데 소속이 없으면',
        { ...person(1), school: undefined },
      ],
      [
        '소속이 필요 없는 구분인데 소속을 보내면',
        { ...person(1), occupation: 'PARENT' },
      ],
    ])('동반자의 %s 거부한다', (_label, companion) => {
      const schema = buildAnswerSchema([companionQuestion]);

      expect(schema.safeParse({ '5': [companion] }).success).toBe(false);
    });

    it('필수가 아니면 빈 목록이나 생략을 받고, 필수이면 1명 이상이어야 한다', () => {
      const optional = buildAnswerSchema([companionQuestion]);
      const required = buildAnswerSchema([
        { ...companionQuestion, requiredStatus: true },
      ]);

      expect(optional.safeParse({ '5': [] }).success).toBe(true);
      expect(optional.safeParse({}).success).toBe(true);
      expect(required.safeParse({ '5': [] }).success).toBe(false);
      expect(required.safeParse({ '5': people(1) }).success).toBe(true);
    });

    it.each(['PRE_SERVICE_TEACHER', 'PARENT', 'GENERAL'])(
      '소속이 필요 없는 구분(%s)은 소속 없이 받는다',
      (occupation) => {
        const schema = buildAnswerSchema([companionQuestion]);
        const companion = { ...person(1), occupation, school: undefined };

        expect(schema.safeParse({ '5': [companion] }).success).toBe(true);
      },
    );

    it.each([
      'ELEMENTARY_STUDENT',
      'MIDDLE_SCHOOL_STUDENT',
      'HIGH_SCHOOL_STUDENT',
      'SCHOOL_STAFF',
      'TEACHER',
    ])('소속이 필요한 구분(%s)은 소속이 있어야 한다', (occupation) => {
      const schema = buildAnswerSchema([companionQuestion]);

      expect(
        schema.safeParse({ '5': [{ ...person(1), occupation }] }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          '5': [{ ...person(1), occupation, school: undefined }],
        }).success,
      ).toBe(false);
    });

    it('목록이 아닌 값은 거부한다', () => {
      const schema = buildAnswerSchema([companionQuestion]);

      expect(schema.safeParse({ '5': '홍길동' }).success).toBe(false);
    });
  });

  describe('지역(REGION)', () => {
    const regionQuestion = {
      id: 7,
      formType: DynamicFormFieldType.REGION,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    } satisfies QuestionSpec;

    it.each(['GWANGJU', 'JEONNAM', 'OTHER'])('%s를 받는다', (region) => {
      const schema = buildAnswerSchema([regionQuestion]);

      expect(schema.safeParse({ '7': region }).success).toBe(true);
    });

    it.each(['광주', 'SEOUL', '', 1])('%s는 거부한다', (value) => {
      const schema = buildAnswerSchema([regionQuestion]);

      expect(schema.safeParse({ '7': value }).success).toBe(false);
    });

    it('필수가 아니면 생략할 수 있다', () => {
      const schema = buildAnswerSchema([
        { ...regionQuestion, requiredStatus: false },
      ]);

      expect(schema.safeParse({}).success).toBe(true);
    });
  });
});
