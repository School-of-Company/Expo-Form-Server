/* eslint-disable @typescript-eslint/naming-convention -- 환경 변수 이름은 외부 설정 계약이라 UPPER_SNAKE_CASE다. */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ProgramFormReservationUnavailableException } from '../common/exceptions/domain.exception.js';
import { ExpoProjectionModule } from '../expo-projection/expo-projection.module.js';
import { ExpoProjectionStore } from '../expo-projection/expo-projection.store.js';
import { EXPO_CLIENT, type ExpoClient } from './expo-client.interface.js';
import { ExpoClientModule } from './expo-client.module.js';
import { HttpExpoClient } from './http-expo-client.js';
import { ProjectedExpoClient } from './projected-expo-client.js';

/** DB 없이 모듈을 띄우려고 프로젝션 저장소만 빈 값으로 바꿔 끼운다. */
@Module({
  providers: [{ provide: ExpoProjectionStore, useValue: {} }],
  exports: [ExpoProjectionStore],
})
class FakeExpoProjectionModule {}

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
  })
    .overrideModule(ExpoProjectionModule)
    .useModule(FakeExpoProjectionModule)
    .compile();
}

describe('ExpoClientModule', () => {
  it('주소와 내부 토큰이 있으면 HTTP 구현체를 등록한다', async () => {
    const moduleRef = await compileWith({
      EXPO_SERVICE_URL: 'http://expo-server',
      EXPO_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
    });

    expect(moduleRef.get(EXPO_CLIENT)).toBeInstanceOf(HttpExpoClient);
  });

  it('프로젝션 플래그가 꺼져 있거나 true가 아니면 지금처럼 HTTP 구현체를 그대로 쓴다', async () => {
    for (const flag of [undefined, 'false', 'TRUE', '1']) {
      // eslint-disable-next-line no-await-in-loop -- 경우마다 모듈을 새로 띄운다
      const moduleRef = await compileWith({
        EXPO_SERVICE_URL: 'http://expo-server',
        EXPO_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
        ...(flag !== undefined && { KAFKA_EXPO_PROJECTION_ENABLED: flag }),
      });
      expect(moduleRef.get(EXPO_CLIENT)).toBeInstanceOf(HttpExpoClient);
    }
  });

  it('프로젝션 플래그가 정확히 true면 프로젝션을 먼저 읽는 구현체를 등록한다', async () => {
    const moduleRef = await compileWith({
      EXPO_SERVICE_URL: 'http://expo-server',
      EXPO_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
      KAFKA_EXPO_PROJECTION_ENABLED: 'true',
    });
    expect(moduleRef.get(EXPO_CLIENT)).toBeInstanceOf(ProjectedExpoClient);
  });

  it('설정이 아예 없으면 부팅은 되고, 존재 확인은 건너뛰어 항상 있다고 답한다', async () => {
    const moduleRef = await compileWith({});
    const client = moduleRef.get<ExpoClient>(EXPO_CLIENT);

    await expect(client.exists('any-expo-id')).resolves.toBe(true);
  });

  it('설정이 없으면 프로그램용 폼 수정은 예약 불가 오류로 막는다(재시도로 풀리지 않는 설정 문제를 알린다)', async () => {
    const moduleRef = await compileWith({});
    const client = moduleRef.get<ExpoClient>(EXPO_CLIENT);

    await expect(
      client.reserveProgramFormUpdate('form-1', 'change-1'),
    ).rejects.toThrow(ProgramFormReservationUnavailableException);
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
