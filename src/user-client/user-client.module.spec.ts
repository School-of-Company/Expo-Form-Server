import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { USER_CLIENT, type UserClient } from './user-client.interface.js';
import { UserClientModule } from './user-client.module.js';

describe('UserClientModule', () => {
  it('구현체가 없어도 모듈 컴파일(부트스트랩) 자체는 실패하지 않는다', async () => {
    await expect(
      Test.createTestingModule({ imports: [UserClientModule] }).compile(),
    ).resolves.toBeDefined();
  });

  it('실제 구현 전까지는 메서드를 호출한 시점에만 에러를 던진다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UserClientModule],
    }).compile();
    const client = moduleRef.get<UserClient>(USER_CLIENT);

    await expect(
      client.findByPhoneNumber('expo-1', '010-0000-0000'),
    ).rejects.toThrow('UserClient is not implemented');
  });
});
