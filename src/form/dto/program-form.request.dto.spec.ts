import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { DynamicFormType } from '../entities/dynamic-form-type.enum.js';
import {
  createProgramFormSchema,
  updateProgramFormSchema,
} from './program-form.request.dto.js';

const sentence = (title: string) => ({
  title,
  formType: DynamicFormFieldType.SENTENCE,
  requiredStatus: true,
  jsonData: {},
  otherJson: null,
});

const dropdown = (title: string) => ({
  title,
  formType: DynamicFormFieldType.DROPDOWN,
  requiredStatus: true,
  jsonData: { '1': '가', '2': '나' },
  otherJson: null,
});

function formWith(dynamicForm: unknown[]) {
  return {
    title: 'AI 체험 프로그램',
    informationText: '안내문',
    participantType: ParticipationType.STANDARD,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    dynamicForm,
  };
}

const errorsOf = (input: unknown) => {
  const result = createProgramFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('프로그램용 폼 요청 검증', () => {
  it('이름·직업 같은 특정 필드 없이도 받고, 신청 방식은 받지 않는다', () => {
    const result = createProgramFormSchema.safeParse(
      formWith([sentence('희망 시간대'), dropdown('참여 형태')]),
    );

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('applicationType');
  });

  it('participantType을 생략하거나 null로 보내면 대상을 정하지 않는다(null)', () => {
    const { participantType: _omitted, ...withoutType } = formWith([]);

    expect(
      createProgramFormSchema.parse(withoutType).participantType,
    ).toBeNull();
    expect(
      createProgramFormSchema.parse({ ...withoutType, participantType: null })
        .participantType,
    ).toBeNull();
    expect(createProgramFormSchema.parse(formWith([])).participantType).toBe(
      ParticipationType.STANDARD,
    );
  });

  it('알 수 없는 participantType은 거부한다', () => {
    expect(
      createProgramFormSchema.safeParse({
        ...formWith([]),
        participantType: 'ADMIN',
      }).success,
    ).toBe(false);
  });

  it('필드가 하나도 없어도 받는다', () => {
    expect(errorsOf(formWith([]))).toEqual([]);
  });

  it('dynamicFormType을 생략하면 DEFAULT로 채운다', () => {
    const result = createProgramFormSchema.parse(
      formWith([sentence('희망 시간대')]),
    );

    expect(result.dynamicForm[0].dynamicFormType).toBe(DynamicFormType.DEFAULT);
  });

  it.each([DynamicFormType.NAME, DynamicFormType.OCCUPATION])(
    '신청 처리용 의미 필드(%s)는 쓸 수 없다',
    (dynamicFormType) => {
      const result = createProgramFormSchema.safeParse(
        formWith([{ ...sentence('이름'), dynamicFormType }]),
      );

      expect(result.success).toBe(false);
    },
  );

  it('접수 시작일이 종료일보다 앞서지 않으면 거부한다', () => {
    const result = createProgramFormSchema.safeParse({
      ...formWith([]),
      startDate: '2026-12-31T00:00:00Z',
      endDate: '2026-01-01T00:00:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('필드 제목이 겹치면 거부한다', () => {
    expect(
      errorsOf(formWith([sentence('희망 시간대'), sentence('희망 시간대')])),
    ).toContain('필드 제목이 겹칩니다.');
  });

  it.each([DynamicFormFieldType.COMPANION, DynamicFormFieldType.REGION])(
    '신청 폼 전용 필드(%s)는 거부한다',
    (formType) => {
      expect(errorsOf(formWith([{ ...sentence('전용'), formType }]))).toContain(
        '동반자·지역 필드는 신청 폼에서만 쓸 수 있습니다.',
      );
    },
  );

  it('드롭다운·다중 선택에 선택지가 없으면 거부한다', () => {
    expect(
      errorsOf(formWith([{ ...dropdown('참여 형태'), jsonData: {} }])),
    ).toContain('선택지가 하나 이상 있어야 합니다.');
  });

  it('선택지형이 아닌 필드가 선택지를 가지면 거부한다', () => {
    expect(
      errorsOf(formWith([{ ...sentence('메모'), jsonData: { '1': '가' } }])),
    ).toContain('이 유형의 필드는 선택지(jsonData)를 쓰지 않습니다.');
  });

  describe('조건부 표시', () => {
    const conditional = (parentIndex: number, triggerValue: string) => ({
      ...sentence('상세'),
      otherJson: { hasEtc: false, conditional: { parentIndex, triggerValue } },
    });

    it('앞에 있는 선택지형 필드의 선택지에 반응하면 받는다', () => {
      expect(
        errorsOf(formWith([dropdown('참여 형태'), conditional(0, '1')])),
      ).toEqual([]);
    });

    it('여러 값(triggerValues)에도 반응할 수 있다', () => {
      const field = {
        ...sentence('상세'),
        otherJson: {
          hasEtc: false,
          conditional: { parentIndex: 0, triggerValues: ['1', '2'] },
        },
      };

      expect(errorsOf(formWith([dropdown('참여 형태'), field]))).toEqual([]);
    });

    it('기준 필드가 자기 자신이거나 뒤에 있으면 거부한다', () => {
      expect(errorsOf(formWith([conditional(0, '1')]))).toContain(
        '조건부 표시의 기준 필드는 자기보다 앞에 있어야 합니다.',
      );
      expect(
        errorsOf(formWith([conditional(1, '1'), dropdown('참여 형태')])),
      ).toContain('조건부 표시의 기준 필드는 자기보다 앞에 있어야 합니다.');
    });

    it('기준 필드가 범위 밖이면 거부한다', () => {
      expect(
        errorsOf(formWith([dropdown('참여 형태'), conditional(5, '1')])),
      ).toContain('조건부 표시의 기준 필드는 자기보다 앞에 있어야 합니다.');
    });

    it('기준 필드가 선택지형이 아니면 거부한다', () => {
      expect(
        errorsOf(formWith([sentence('메모'), conditional(0, '1')])),
      ).toContain('조건부 표시의 기준 필드는 선택지형이어야 합니다.');
    });

    it('기준 필드에 없는 선택지를 가리키면 거부한다', () => {
      expect(
        errorsOf(formWith([dropdown('참여 형태'), conditional(0, '9')])),
      ).toContain('조건부 표시가 기준 필드에 없는 선택지를 가리킵니다.');
    });
  });

  describe('수정 요청', () => {
    it('expectedVersion이 필요하고 1 이상의 정수여야 한다', () => {
      const body = formWith([sentence('희망 시간대')]);

      expect(
        updateProgramFormSchema.safeParse({ ...body, expectedVersion: 1 })
          .success,
      ).toBe(true);
      expect(updateProgramFormSchema.safeParse(body).success).toBe(false);
      expect(
        updateProgramFormSchema.safeParse({ ...body, expectedVersion: 0 })
          .success,
      ).toBe(false);
      expect(
        updateProgramFormSchema.safeParse({ ...body, expectedVersion: 1.5 })
          .success,
      ).toBe(false);
    });

    it('생성과 같은 필드 규칙이 적용된다', () => {
      const body = {
        ...formWith([sentence('희망 시간대'), sentence('희망 시간대')]),
        expectedVersion: 1,
      };

      expect(updateProgramFormSchema.safeParse(body).success).toBe(false);
    });
  });
});
