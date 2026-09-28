import { describe, expect, it } from 'vitest';
import { normalizePhoneNumber } from './phone-number.util.js';

describe('normalizePhoneNumber', () => {
  it('하이픈을 제거한다', () => {
    expect(normalizePhoneNumber('010-1234-5678')).toBe('01012345678');
  });

  it('공백과 괄호가 섞여도 숫자만 남긴다', () => {
    expect(normalizePhoneNumber('(010) 1234 5678')).toBe('01012345678');
  });

  it('이미 숫자만 있으면 그대로 돌려준다', () => {
    expect(normalizePhoneNumber('01012345678')).toBe('01012345678');
  });
});
