import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { EXPO_CLIENT, type ExpoClient } from './expo-client.interface.js';
import { ExpoClientModule } from './expo-client.module.js';

describe('ExpoClientModule', () => {
  it('구현체가 없어도 모듈 컴파일(부트스트랩) 자체는 실패하지 않는다', async () => {
    await expect(
      Test.createTestingModule({ imports: [ExpoClientModule] }).compile(),
    ).resolves.toBeDefined();
  });

  it('실제 구현 전까지는 메서드를 호출한 시점에만 에러를 던진다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ExpoClientModule],
    }).compile();
    const client = moduleRef.get<ExpoClient>(EXPO_CLIENT);

    await expect(client.exists('some-expo-id')).rejects.toThrow(
      'ExpoClient is not implemented',
    );
  });
});
