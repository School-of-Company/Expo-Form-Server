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

    it.each([
      'KINDERGARTEN_STUDENT',
      'ELEMENTARY_STUDENT',
      'MIDDLE_SCHOOL_STUDENT',
      'HIGH_SCHOOL_STUDENT',
      'SCHOOL_STAFF',
      'PARENT',
      'GENERAL',
    ])('소속이 필요 없는 구분(%s)은 소속 없이 받는다', (occupation) => {
      const schema = buildAnswerSchema([companionQuestion]);
      const companion = { ...person(1), occupation, school: undefined };

      expect(schema.safeParse({ '5': [companion] }).success).toBe(true);
    });

    it.each(['TEACHER', 'PRE_SERVICE_TEACHER'])(
      '소속이 필요한 구분(%s)은 소속이 있어야 한다',
      (occupation) => {
        const schema = buildAnswerSchema([companionQuestion]);

        expect(
          schema.safeParse({ '5': [{ ...person(1), occupation }] }).success,
        ).toBe(true);
        expect(
          schema.safeParse({
            '5': [{ ...person(1), occupation, school: undefined }],
          }).success,
        ).toBe(false);
      },
    );

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

  describe('조건부 문항(conditional)', () => {
    const roleQuestion = {
      id: 10,
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '교사', '2': '학생' },
      otherJson: null,
    } satisfies QuestionSpec;
    // questions[0]이 부모이고 '1'(교사)일 때만 보이는 필수 문항.
    const schoolQuestion = {
      id: 11,
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: {
        hasEtc: false,
        conditional: { parentIndex: 0, triggerValue: '1' },
      },
    } satisfies QuestionSpec;
    const schema = buildAnswerSchema([roleQuestion, schoolQuestion]);

    it('부모 답변이 trigger가 아니면 숨겨진 필수 문항을 빼도 받는다', () => {
      expect(schema.parse({ '10': '2' })).toEqual({ '10': '2' });
    });

    it('부모 답변이 trigger이면 필수 문항이 비었을 때 거부한다', () => {
      expect(schema.safeParse({ '10': '1' }).success).toBe(false);
    });

    it('부모 답변이 trigger이면 값을 받는다', () => {
      expect(schema.parse({ '10': '1', '11': '서울고' })).toEqual({
        '10': '1',
        '11': '서울고',
      });
    });

    it('숨겨진 문항에 값이 와도 거부하지 않는다', () => {
      expect(schema.safeParse({ '10': '2', '11': '서울고' }).success).toBe(
        true,
      );
    });

    it('숨겨진 문항의 값도 형태가 틀리면 거부한다', () => {
      expect(schema.safeParse({ '10': '2', '11': 123 }).success).toBe(false);
    });

    it('연쇄 조건에서 중간 문항이 빠지고 끝 문항 값이 와도 받는다', () => {
      // Q1=A(1)이면 Q2, Q2=X(1)이면 Q3. Q1을 B로 바꿔 Q2는 빠졌지만 Q3의 옛 값이 온다.
      const chained = buildAnswerSchema([
        { ...roleQuestion, id: 30 },
        {
          ...roleQuestion,
          id: 31,
          otherJson: {
            hasEtc: false,
            conditional: { parentIndex: 0, triggerValue: '1' },
          },
        },
        {
          ...schoolQuestion,
          id: 32,
          otherJson: {
            hasEtc: false,
            conditional: { parentIndex: 1, triggerValue: '1' },
          },
        },
      ]);

      expect(chained.safeParse({ '30': '2', '32': '서울고' }).success).toBe(
        true,
      );
    });

    describe('연쇄 조건에서 숨겨진 부모', () => {
      // Q1(드롭다운 1/2) → Q2(Q1=1) → Q3(필수 문장, Q2=1)
      const chain = (requiredTail: boolean) =>
        buildAnswerSchema([
          { ...roleQuestion, id: 40 },
          {
            ...roleQuestion,
            id: 41,
            requiredStatus: false,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 0, triggerValue: '1' },
            },
          },
          {
            ...schoolQuestion,
            id: 42,
            requiredStatus: requiredTail,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 1, triggerValue: '1' },
            },
          },
        ]);

      it('부모가 숨겨졌으면 부모가 남긴 옛 값이 trigger와 같아도 자식의 필수를 요구하지 않는다', () => {
        // Q1을 2로 바꿔 Q2가 숨겨졌고 Q2의 옛 값(1)이 함께 온다. Q3는 화면에 보이지 않는다.
        expect(chain(true).safeParse({ '40': '2', '41': '1' }).success).toBe(
          true,
        );
        expect(chain(true).safeParse({ '40': '2' }).success).toBe(true);
      });

      it('부모가 보이고 trigger가 맞으면 자식의 필수를 요구한다', () => {
        expect(chain(true).safeParse({ '40': '1', '41': '1' }).success).toBe(
          false,
        );
        expect(
          chain(true).safeParse({ '40': '1', '41': '1', '42': '서울고' })
            .success,
        ).toBe(true);
      });

      it('부모는 보이지만 trigger가 아니면 자식은 숨겨진다', () => {
        expect(chain(true).safeParse({ '40': '1', '41': '2' }).success).toBe(
          true,
        );
      });

      it('3단 이상으로 이어져도 맨 위가 숨겨지면 아래 전부 숨겨진다', () => {
        const deep = buildAnswerSchema([
          { ...roleQuestion, id: 50 },
          {
            ...roleQuestion,
            id: 51,
            requiredStatus: false,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 0, triggerValue: '1' },
            },
          },
          {
            ...roleQuestion,
            id: 52,
            requiredStatus: false,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 1, triggerValue: '1' },
            },
          },
          {
            ...schoolQuestion,
            id: 53,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 2, triggerValue: '1' },
            },
          },
        ]);

        expect(
          deep.safeParse({ '50': '2', '51': '1', '52': '1' }).success,
        ).toBe(true);
      });

      it('부모 연결이 순환이거나 자기 자신이어도 무한 반복하지 않는다', () => {
        const cyclic = buildAnswerSchema([
          {
            ...roleQuestion,
            id: 60,
            requiredStatus: false,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 1, triggerValue: '1' },
            },
          },
          {
            ...roleQuestion,
            id: 61,
            requiredStatus: false,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 0, triggerValue: '1' },
            },
          },
          {
            ...schoolQuestion,
            id: 62,
            otherJson: {
              hasEtc: false,
              conditional: { parentIndex: 2, triggerValue: '1' },
            },
          },
        ]);

        expect(cyclic.safeParse({}).success).toBe(false);
        expect(cyclic.safeParse({ '62': '서울고' }).success).toBe(true);
      });
    });

    it('부모 답변이 없어도 숨겨진 것으로 본다', () => {
      const optionalParent = buildAnswerSchema([
        { ...roleQuestion, requiredStatus: false },
        schoolQuestion,
      ]);

      expect(optionalParent.parse({})).toEqual({});
    });

    it('triggerValues 중 하나이거나 다중 선택에 포함되면 보인다', () => {
      const multi = buildAnswerSchema([
        { ...boundedMultipleQuestion, id: 20 },
        {
          ...schoolQuestion,
          id: 21,
          otherJson: {
            hasEtc: false,
            conditional: { parentIndex: 0, triggerValues: ['2', '3'] },
          },
        },
      ]);

      expect(multi.safeParse({ '20': ['1', '3'] }).success).toBe(false);
      expect(multi.safeParse({ '20': ['1'] }).success).toBe(true);
    });

    it('선택 문항은 보여도 생략할 수 있다', () => {
      const optional = buildAnswerSchema([
        roleQuestion,
        { ...schoolQuestion, requiredStatus: false },
      ]);

      expect(optional.parse({ '10': '1' })).toEqual({ '10': '1' });
    });
  });
});

describe('buildAnswerSchema 답변 값 규칙', () => {
  const requiredCheckbox = {
    ...optionalCheckboxQuestion,
    id: 5,
    requiredStatus: true,
  } satisfies QuestionSpec;
  const optionalSentence = {
    ...sentenceQuestion,
    id: 6,
    requiredStatus: false,
  } satisfies QuestionSpec;
  const optionalDropdown = {
    ...dropdownQuestion,
    id: 7,
    requiredStatus: false,
  } satisfies QuestionSpec;
  const optionalMultiple = {
    ...boundedMultipleQuestion,
    id: 8,
    requiredStatus: false,
  } satisfies QuestionSpec;

  it('필수 체크박스는 true만 받는다', () => {
    const schema = buildAnswerSchema([requiredCheckbox]);

    expect(schema.safeParse({ '5': true }).success).toBe(true);
    expect(schema.safeParse({ '5': false }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('선택 체크박스는 false도 받는다', () => {
    const schema = buildAnswerSchema([optionalCheckboxQuestion]);

    expect(schema.safeParse({ '3': false }).success).toBe(true);
  });

  it('조건부 필수 체크박스는 보일 때만 true를 요구한다', () => {
    const conditionalCheckbox = {
      ...requiredCheckbox,
      id: 9,
      otherJson: {
        hasEtc: false,
        conditional: { parentIndex: 0, triggerValue: '1' },
      },
    } satisfies QuestionSpec;
    const schema = buildAnswerSchema([dropdownQuestion, conditionalCheckbox]);

    expect(schema.safeParse({ '2': '1', '9': false }).success).toBe(false);
    expect(schema.safeParse({ '2': '1', '9': true }).success).toBe(true);
    expect(schema.safeParse({ '2': '2', '9': false }).success).toBe(true);
  });

  it.each(['', null, []])('선택 문항의 빈 값(%j)은 생략과 같다', (empty) => {
    const schema = buildAnswerSchema([
      optionalSentence,
      optionalDropdown,
      optionalMultiple,
    ]);
    const result = schema.safeParse({ '6': empty, '7': empty, '8': empty });

    expect(result.success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('필수 문항의 빈 값은 여전히 거부한다', () => {
    expect(
      buildAnswerSchema([sentenceQuestion]).safeParse({ '1': '' }).success,
    ).toBe(false);
    expect(
      buildAnswerSchema([sentenceQuestion]).safeParse({ '1': null }).success,
    ).toBe(false);
    expect(
      buildAnswerSchema([boundedMultipleQuestion]).safeParse({ '4': [] })
        .success,
    ).toBe(false);
  });

  it('조건부 필수 문항이 보이는데 빈 값이면 필수 문항 오류다', () => {
    const conditional = {
      ...sentenceQuestion,
      id: 10,
      otherJson: {
        hasEtc: false,
        conditional: { parentIndex: 0, triggerValue: '1' },
      },
    } satisfies QuestionSpec;
    const schema = buildAnswerSchema([dropdownQuestion, conditional]);

    expect(schema.safeParse({ '2': '1', '10': '' }).success).toBe(false);
    expect(schema.safeParse({ '2': '2', '10': '' }).success).toBe(true);
  });

  it('다중 선택의 중복 값은 거부한다', () => {
    const schema = buildAnswerSchema([boundedMultipleQuestion]);

    expect(schema.safeParse({ '4': ['1', '1'] }).success).toBe(false);
    expect(schema.safeParse({ '4': ['1', '2'] }).success).toBe(true);
  });
});
