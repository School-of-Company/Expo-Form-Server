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
  it('설정을 읽어 HTTP 구현체를 등록한다', async () => {
    const moduleRef = await compileWith({
      USER_SERVICE_URL: 'http://user-server/',
      USER_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
    });
    const client = moduleRef.get<UserClient>(USER_CLIENT);
    expect(client).toBeInstanceOf(HttpUserClient);

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

  it('설정이 없으면 부팅 단계에서 실패한다', async () => {
    await expect(compileWith({})).rejects.toThrow(
      'USER_SERVICE_URL and USER_SERVICE_INTERNAL_TOKEN are required',
    );
  });
});
