import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { InternalTokenGuard } from './internal-token.guard.js';

const token = 'a'.repeat(32);

const configWith = (value: string | undefined) =>
  ({ get: () => value }) as unknown as ConfigService;

const contextWith = (header: string | undefined) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ header: () => header }),
    }),
  }) as unknown as ExecutionContext;

describe('InternalTokenGuard', () => {
  const guard = new InternalTokenGuard(configWith(token));

  it('토큰이 같으면 통과시킨다', () => {
    expect(guard.canActivate(contextWith(token))).toBe(true);
  });

  it.each([
    ['헤더가 없으면', undefined],
    ['토큰이 다르면', 'b'.repeat(32)],
    ['길이가 다르면', 'a'],
  ])('%s 401을 던진다', (_label, header) => {
    expect(() => guard.canActivate(contextWith(header))).toThrow(
      UnauthorizedException,
    );
  });

  it.each([
    ['없으면', undefined],
    ['32자보다 짧으면', 'short'],
  ])('INTERNAL_TOKEN이 %s 생성 단계에서 실패한다', (_label, value) => {
    expect(() => new InternalTokenGuard(configWith(value))).toThrow(
      'INTERNAL_TOKEN must be at least 32 characters.',
    );
  });
});
