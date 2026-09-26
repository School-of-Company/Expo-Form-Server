import { describe, expect, it } from 'vitest';
import { jsonDataSchema, otherJsonSchema } from './field-spec.schema.js';

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
});
