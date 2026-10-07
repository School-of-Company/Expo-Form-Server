import { describe, expect, it } from 'vitest';
import {
  jsonDataSchema,
  otherJsonSchema,
  triggerValuesOf,
} from './field-spec.schema.js';

describe('jsonDataSchema', () => {
  it('문자열 선택지와 옵션 객체 선택지를 섞어서 받는다', () => {
    const parsed = jsonDataSchema.parse({
      '1': '온라인',
      '2': { value: '오프라인', isAlwaysSelected: true },
    });

    expect(parsed['2']).toEqual({ value: '오프라인', isAlwaysSelected: true });
  });

  it('선택지 값이 문자열도 옵션 객체도 아니면 거부한다', () => {
    expect(() => jsonDataSchema.parse({ '1': 42 })).toThrow();
  });
});

describe('otherJsonSchema', () => {
  it('조건부 표시 설정을 받는다', () => {
    const parsed = otherJsonSchema.parse({
      hasEtc: false,
      conditional: { parentIndex: 0, triggerValue: '온라인' },
    });

    expect(parsed.conditional?.triggerValue).toBe('온라인');
  });

  it('hasEtc가 없으면 거부한다', () => {
    expect(() => otherJsonSchema.parse({ maxSelection: 2 })).toThrow();
  });

  it('maxSelection이 0 이하면 거부한다', () => {
    expect(() =>
      otherJsonSchema.parse({ hasEtc: true, maxSelection: 0 }),
    ).toThrow();
  });

  it('여러 값에 반응하는 조건(triggerValues)을 받는다', () => {
    const parsed = otherJsonSchema.parse({
      hasEtc: false,
      conditional: {
        parentIndex: 0,
        triggerValues: ['TEACHER', 'PRE_SERVICE_TEACHER'],
      },
    });

    expect(parsed.conditional?.triggerValues).toEqual([
      'TEACHER',
      'PRE_SERVICE_TEACHER',
    ]);
  });

  it.each([
    ['둘 다 있으면', { triggerValue: 'A', triggerValues: ['B'] }],
    ['둘 다 없으면', {}],
    ['triggerValues가 비어 있으면', { triggerValues: [] }],
  ])('조건의 반응 값이 %s 거부한다', (_label, trigger) => {
    expect(
      otherJsonSchema.safeParse({
        hasEtc: false,
        conditional: { parentIndex: 0, ...trigger },
      }).success,
    ).toBe(false);
  });

  it('triggerValuesOf는 하나든 여럿이든 같은 모양으로 꺼낸다', () => {
    expect(triggerValuesOf({ parentIndex: 0, triggerValue: 'A' })).toEqual([
      'A',
    ]);
    expect(
      triggerValuesOf({ parentIndex: 0, triggerValues: ['A', 'B'] }),
    ).toEqual(['A', 'B']);
  });
});
