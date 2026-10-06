import type { ArgumentsHost } from '@nestjs/common';
import { DicoshotExceptionFilter } from 'dicoshot-nest';
import { describe, expect, it, vi } from 'vitest';
import { ExternalServiceUnavailableException } from '../exceptions/domain.exception.js';
import { dicoshotFilterOptions } from './dicoshot-filter.options.js';

/** 실제 Dicoshot 필터에 우리 설정을 넣어 무엇이 Discord로 나가는지 본다. */
function setup() {
  const sendTo = vi.fn().mockResolvedValue(true);
  const filter = new DicoshotExceptionFilter({ sendTo } as never, {
    webhookUrl: 'https://discord.invalid/webhook',
    applicationName: 'expo-form-server',
    filter: dicoshotFilterOptions,
  });
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = (path: string, body: unknown) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path, body }),
        getResponse: () => response,
      }),
    }) as unknown as ArgumentsHost;

  return { filter, sendTo, response, host };
}

describe('dicoshotFilterOptions', () => {
  it('의존 서비스 장애(503)는 알리지 않는다 — QR 토큰이 담긴 경로도 나가지 않는다', async () => {
    const { filter, sendTo, response, host } = setup();

    filter.catch(
      new ExternalServiceUnavailableException(),
      host('/surveys/qr/SECRET_QR_TOKEN', {}),
    );
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(sendTo).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
  });

  it('그 밖의 500은 알리되 요청 바디(전화번호·답변)는 싣지 않는다', async () => {
    const { filter, sendTo, host } = setup();

    filter.catch(
      new Error('boom'),
      host('/surveys/answer/standard/expo-1', {
        phoneNumber: '01012345678',
        answers: { 1: '비밀 답변' },
      }),
    );
    await vi.waitFor(() => {
      expect(sendTo).toHaveBeenCalled();
    });

    const sent = JSON.stringify(sendTo.mock.calls[0]);
    expect(sent).not.toContain('01012345678');
    expect(sent).not.toContain('비밀 답변');
  });
});
