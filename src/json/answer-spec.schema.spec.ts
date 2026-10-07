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
});
