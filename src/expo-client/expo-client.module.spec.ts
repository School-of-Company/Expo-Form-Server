/* eslint-disable @typescript-eslint/naming-convention -- 환경 변수 이름은 외부 설정 계약이라 UPPER_SNAKE_CASE다. */
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { EXPO_CLIENT, type ExpoClient } from './expo-client.interface.js';
import { ExpoClientModule } from './expo-client.module.js';
import { HttpExpoClient } from './http-expo-client.js';

async function compileWith(env: Record<string, string>) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => env],
      }),
      ExpoClientModule,
    ],
  }).compile();
}

describe('ExpoClientModule', () => {
  it('주소와 내부 토큰이 있으면 HTTP 구현체를 등록한다', async () => {
    const moduleRef = await compileWith({
      EXPO_SERVICE_URL: 'http://expo-server',
      EXPO_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
    });

    expect(moduleRef.get(EXPO_CLIENT)).toBeInstanceOf(HttpExpoClient);
  });

  it('설정이 아예 없으면 부팅은 되고, 존재 확인은 건너뛰어 항상 있다고 답한다', async () => {
    const moduleRef = await compileWith({});
    const client = moduleRef.get<ExpoClient>(EXPO_CLIENT);

    await expect(client.exists('any-expo-id')).resolves.toBe(true);
  });

  it('주소만 있거나 토큰이 짧으면 설정 실수이므로 부팅 단계에서 실패한다', async () => {
    await expect(
      compileWith({ EXPO_SERVICE_URL: 'http://expo-server' }),
    ).rejects.toThrow('must be set together');
    await expect(
      compileWith({
        EXPO_SERVICE_URL: 'http://expo-server',
        EXPO_SERVICE_INTERNAL_TOKEN: 'short',
      }),
    ).rejects.toThrow();
  });
});
