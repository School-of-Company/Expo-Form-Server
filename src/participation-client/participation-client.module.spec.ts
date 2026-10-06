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
});
