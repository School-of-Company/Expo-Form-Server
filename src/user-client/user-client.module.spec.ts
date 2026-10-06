/* eslint-disable @typescript-eslint/naming-convention -- 환경 변수 이름은 외부 설정 계약이라 UPPER_SNAKE_CASE다. */
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { HttpUserClient } from './http-user-client.js';
import { USER_CLIENT, type UserClient } from './user-client.interface.js';
import { UserClientModule } from './user-client.module.js';

async function compileWith(env: Record<string, string>) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => env],
      }),
      UserClientModule,
    ],
  }).compile();
}

describe('UserClientModule', () => {
  it('주소와 내부 토큰이 있으면 HTTP 구현체를 등록한다', async () => {
    const moduleRef = await compileWith({
      USER_SERVICE_URL: 'http://user-server/',
      USER_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
    });

    const client = moduleRef.get<UserClient>(USER_CLIENT);
    expect(client).toBeInstanceOf(HttpUserClient);

    // 주소 끝의 `/`는 떼어서 `//internal` 경로가 되지 않는다.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await client.findParticipant({
        expoId: 'expo-1',
        phoneNumber: '01012345678',
        participationType: ParticipationType.STANDARD,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://user-server/internal/participants/resolve',
    );
  });

  it('내부 토큰이 없으면 부팅 단계에서 실패한다', async () => {
    await expect(
      compileWith({ USER_SERVICE_URL: 'http://user-server' }),
    ).rejects.toThrow('USER_SERVICE_INTERNAL_TOKEN');
  });

  it('내부 토큰이 32자보다 짧으면 값을 드러내지 않고 실패한다', async () => {
    const shortToken = 'short-secret-value';

    const failure = compileWith({
      USER_SERVICE_URL: 'http://user-server',
      USER_SERVICE_INTERNAL_TOKEN: shortToken,
    });

    await expect(failure).rejects.toThrow('at least 32 characters');
    await expect(failure).rejects.not.toThrow(shortToken);
  });

  it('주소가 없으면 부팅 단계에서 실패한다', async () => {
    await expect(
      compileWith({ USER_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32) }),
    ).rejects.toThrow('USER_SERVICE_URL');
  });
});
