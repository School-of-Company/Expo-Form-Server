import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { buildAnswerSchema } from '../json/answer-spec.schema.js';
import { createProgramFormSchema } from './dto/program-form.request.dto.js';

/**
 * 프로그램 신청 답변 계약(`docs/program-form-answer-contract.md`)을 폼 정의 → 답변 순서로 고정한다.
 * 신청 서비스는 폼 응답의 문항으로 같은 `buildAnswerSchema`와 같은 규칙을 적용해야 한다.
 */
const form = {
  title: 'AI 체험 프로그램',
  informationText: '안내문',
  participantType: null,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-12-31T00:00:00Z',
  dynamicForm: [
    {
      title: '희망 사항',
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    },
    {
      title: '개인정보 동의',
      formType: DynamicFormFieldType.CHECKBOX,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    },
    {
      title: '참여 형태',
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '온라인', '2': '오프라인' },
      otherJson: null,
    },
    {
      title: '관심 분야',
      formType: DynamicFormFieldType.MULTIPLE,
      requiredStatus: false,
      jsonData: { '1': 'AI', '2': '로봇', '3': '코딩' },
      otherJson: { hasEtc: false, maxSelection: 2 },
    },
  ],
};

/** 저장된 폼처럼 문항에 1부터 id를 붙인다. */
const questions = createProgramFormSchema
  .parse(form)
  .dynamicForm.map((field, index) => ({ id: index + 1, ...field }));
const answerSchema = buildAnswerSchema(questions);

const validAnswers = {
  '1': '오전 시간대를 희망합니다',
  '2': true,
  '3': '1',
  '4': ['1', '3'],
};

describe('프로그램 신청 답변 계약', () => {
  it('문항 id를 키로, 유형별 값을 담은 답변을 받는다', () => {
    expect(answerSchema.safeParse(validAnswers).success).toBe(true);
  });

  it('선택 문항(MULTIPLE)은 생략할 수 있다', () => {
    const { '4': _omitted, ...answers } = validAnswers;

    expect(answerSchema.safeParse(answers).success).toBe(true);
  });

  it.each([
    ['필수 문항 누락', { ...validAnswers, '1': undefined }],
    ['선택지에 없는 값', { ...validAnswers, '3': '9' }],
    ['선택 개수 초과', { ...validAnswers, '4': ['1', '2', '3'] }],
    ['체크박스에 문자열', { ...validAnswers, '2': 'true' }],
    ['없는 문항 id', { ...validAnswers, '99': 'x' }],
  ])('거절한다: %s', (_name, answers) => {
    expect(answerSchema.safeParse(answers).success).toBe(false);
  });

  it('답변 계약이 없는 이미지·기타 입력 필드는 폼을 만들 때 거절한다', () => {
    const image = {
      title: '사진',
      formType: DynamicFormFieldType.IMAGE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    };
    const etc = {
      title: '기타 선택',
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '가' },
      otherJson: { hasEtc: true },
    };

    for (const field of [image, etc]) {
      const result = createProgramFormSchema.safeParse({
        ...form,
        participantType: ParticipationType.STANDARD,
        dynamicForm: [field],
      });

      expect(result.success).toBe(false);
    }
  });
});
