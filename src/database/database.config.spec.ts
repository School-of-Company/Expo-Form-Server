import { describe, expect, it } from 'vitest';
import { resolveSsl } from './database.config.js';

describe('resolveSsl', () => {
  it('운영이 아니면 TLS를 쓰지 않는다', () => {
    expect(resolveSsl(undefined, undefined)).toBe(false);
    expect(resolveSsl('development', 'false')).toBe(false);
  });

  it('운영에서는 인증서 검증이 기본이다', () => {
    expect(resolveSsl('production', undefined)).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('운영에서 DATABASE_SSL_REJECT_UNAUTHORIZED=false일 때만 검증을 끈다', () => {
    expect(resolveSsl('production', 'false')).toEqual({
      rejectUnauthorized: false,
    });
    expect(resolveSsl('production', 'true')).toEqual({
      rejectUnauthorized: true,
    });
  });
});
