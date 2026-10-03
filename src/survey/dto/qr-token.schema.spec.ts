import { describe, expect, it } from 'vitest';
import { qrTokenSchema } from './qr-token.schema.js';

describe('qrTokenSchema', () => {
  it('비어 있지 않고 최대 길이 이내면 통과한다', () => {
    expect(qrTokenSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });

  it('빈 값이나 최대 길이를 넘는 값은 거부한다', () => {
    expect(qrTokenSchema.safeParse('').success).toBe(false);
    expect(qrTokenSchema.safeParse('a'.repeat(65)).success).toBe(false);
  });
});
