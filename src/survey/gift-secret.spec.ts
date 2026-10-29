import { describe, expect, it } from 'vitest';
import { generateGiftToken, hashGiftToken, hashPin } from './gift-secret.js';

describe('기념품 토큰', () => {
  it('매번 다른 URL 안전 토큰을 만들고 해시는 원문과 다르다', () => {
    const a = generateGiftToken();
    const b = generateGiftToken();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[\w-]{43}$/u);
    expect(hashGiftToken(a)).toMatch(/^[\da-f]{64}$/u);
    expect(hashGiftToken(a)).not.toBe(a);
    expect(hashGiftToken(a)).toBe(hashGiftToken(a));
  });
});

describe('직원 PIN 해시', () => {
  it('원문을 담지 않는다', async () => {
    const stored = await hashPin('123456');

    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain('123456');
  });

  it('같은 PIN도 솔트 때문에 해시가 매번 다르다', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
  });
});
