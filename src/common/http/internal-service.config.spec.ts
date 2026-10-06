/* eslint-disable @typescript-eslint/naming-convention -- 환경 변수 이름은 외부 설정 계약이라 UPPER_SNAKE_CASE다. */
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  readInternalServiceOptions,
  requireInternalServiceOptions,
} from './internal-service.config.js';

const keys = { urlKey: 'SERVICE_URL', tokenKey: 'SERVICE_TOKEN' };
const token = 'x'.repeat(32);

function configOf(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('readInternalServiceOptions', () => {
  it('주소와 토큰을 읽고 주소 끝의 /를 뗀다', () => {
    expect(
      readInternalServiceOptions(
        configOf({ SERVICE_URL: 'http://svc/', SERVICE_TOKEN: token }),
        keys,
      ),
    ).toEqual({ baseUrl: 'http://svc', internalToken: token });
  });

  it('둘 다 없으면 연동하지 않는다는 뜻으로 null이다', () => {
    expect(readInternalServiceOptions(configOf({}), keys)).toBeNull();
  });

  it('하나만 있으면 설정 실수로 보고 던진다', () => {
    expect(() =>
      readInternalServiceOptions(configOf({ SERVICE_URL: 'http://svc' }), keys),
    ).toThrow('SERVICE_URL and SERVICE_TOKEN must be set together');
  });

  it('토큰이 32자보다 짧으면 값을 드러내지 않고 던진다', () => {
    const shortToken = 'short-secret-value';
    const read = () =>
      readInternalServiceOptions(
        configOf({ SERVICE_URL: 'http://svc', SERVICE_TOKEN: shortToken }),
        keys,
      );

    expect(read).toThrow('SERVICE_TOKEN must be at least 32 characters');
    expect(read).not.toThrow(shortToken);
  });
});

describe('requireInternalServiceOptions', () => {
  it('설정이 아예 없어도 던진다', () => {
    expect(() => requireInternalServiceOptions(configOf({}), keys)).toThrow(
      'SERVICE_URL and SERVICE_TOKEN are required',
    );
  });
});
