import { describe, expect, it } from 'vitest';
import { normalizeLotteryPhone } from './lottery-phone.js';

describe('normalizeLotteryPhone', () => {
  it.each([
    ['010-1234-5678', '01012345678'],
    ['010 1234 5678', '01012345678'],
    ['01012345678', '01012345678'],
    ['011-123-4567', '0111234567'],
  ])('%s를 숫자만 남긴 번호로 맞춘다', (raw, expected) => {
    expect(normalizeLotteryPhone(raw)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '02-123-4567',
    '010-123',
    '+82 10-1234-5678',
    '0101234567890',
  ])('문자를 보낼 수 없는 모양(%s)은 null이다', (raw) => {
    expect(normalizeLotteryPhone(raw)).toBeNull();
  });
});
