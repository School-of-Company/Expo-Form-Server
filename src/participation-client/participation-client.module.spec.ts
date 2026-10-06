/* eslint-disable @typescript-eslint/naming-convention -- 환경 변수 이름은 외부 설정 계약이라 UPPER_SNAKE_CASE다. */
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { HttpParticipationClient } from './http-participation-client.js';
import {
  PARTICIPATION_CLIENT,
  type ParticipationClient,
} from './participation-client.interface.js';
import { ParticipationClientModule } from './participation-client.module.js';

async function compileWith(env: Record<string, string>) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => env],
      }),
      ParticipationClientModule,
    ],
  }).compile();
}

describe('ParticipationClientModule', () => {
  it('주소와 내부 토큰이 있으면 HTTP 구현체를 등록한다', async () => {
    const moduleRef = await compileWith({
      PARTICIPATION_SERVICE_URL: 'http://attendance-server',
      PARTICIPATION_SERVICE_INTERNAL_TOKEN: 'x'.repeat(32),
    });

    expect(moduleRef.get(PARTICIPATION_CLIENT)).toBeInstanceOf(
      HttpParticipationClient,
    );
  });

  it('설정이 아예 없으면 부팅은 되고, 호출하면 503 예외를 던진다', async () => {
    const moduleRef = await compileWith({});
    const client = moduleRef.get<ParticipationClient>(PARTICIPATION_CLIENT);

    await expect(client.findEnteredToken('qr-1')).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });

  it('주소와 토큰 중 하나만 있으면 설정 실수로 보고 부팅 단계에서 실패한다', async () => {
    await expect(
      compileWith({ PARTICIPATION_SERVICE_URL: 'http://attendance-server' }),
    ).rejects.toThrow('must be set together');
  });

  it('내부 토큰이 32자보다 짧으면 값을 드러내지 않고 실패한다', async () => {
    const shortToken = 'short-secret-value';

    const failure = compileWith({
      PARTICIPATION_SERVICE_URL: 'http://attendance-server',
      PARTICIPATION_SERVICE_INTERNAL_TOKEN: shortToken,
    });

    await expect(failure).rejects.toThrow('at least 32 characters');
    await expect(failure).rejects.not.toThrow(shortToken);
  });
});
