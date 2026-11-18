import { describe, expect, it } from 'vitest';
import {
  generateGiftToken,
  hashGiftToken,
  hashPin,
  verifyPin,
} from './gift-secret.js';

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
  it('원문을 담지 않고 같은 PIN만 통과한다', async () => {
    const stored = await hashPin('123456');

    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain('123456');
    await expect(verifyPin('123456', stored)).resolves.toBe(true);
    await expect(verifyPin('123457', stored)).resolves.toBe(false);
  });

  it('같은 PIN도 솔트 때문에 해시가 매번 다르다', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
  });

  it('형식이 깨진 해시는 항상 불일치다', async () => {
    await expect(verifyPin('1234', 'plain')).resolves.toBe(false);
    await expect(verifyPin('1234', 'scrypt$$')).resolves.toBe(false);
  });
});
