import type { ArgumentsHost } from '@nestjs/common';
import { DicoshotExceptionFilter } from 'dicoshot-nest';
import { describe, expect, it, vi } from 'vitest';
import {
  ExternalServiceUnavailableException,
  FormNotFoundException,
  ProgramFormReservationUnavailableException,
} from '../exceptions/domain.exception.js';
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

describe('dicoshotFilterOptions.throttle', () => {
  // 억제 캐시는 프로세스 전역이라 다른 테스트와 겹치지 않게 이 블록만의 경로를 쓴다.
  const flush = async () =>
    new Promise((resolve) => {
      setImmediate(resolve);
    });

  it('같은 오류가 같은 경로에서 반복되면 창 안에서는 한 번만 알린다', async () => {
    const { filter, sendTo, host } = setup();

    for (let index = 0; index < 5; index += 1) {
      filter.catch(new Error('db down'), host('/forms/throttle-same', {}));
    }

    await flush();

    expect(sendTo).toHaveBeenCalledTimes(1);
  });

  it('경로 매개변수만 다른 같은 오류는 지금은 따로 센다(Dicoshot이 실제 경로를 키로 쓰기 때문)', async () => {
    const { filter, sendTo, host } = setup();

    filter.catch(new Error('db down'), host('/forms/by-id/id-aaa', {}));
    filter.catch(new Error('db down'), host('/forms/by-id/id-bbb', {}));
    await flush();

    // DicoShot/dicoshot-nest#4(라우트 템플릿 키)가 반영되면 1건으로 줄어야 한다.
    expect(sendTo).toHaveBeenCalledTimes(2);
  });

  it('서로 다른 오류는 억제하지 않는다', async () => {
    const { filter, sendTo, host } = setup();

    filter.catch(new Error('first'), host('/forms/throttle-kinds', {}));
    filter.catch(new TypeError('second'), host('/forms/throttle-kinds', {}));
    await flush();

    expect(sendTo).toHaveBeenCalledTimes(2);
  });
});

describe('dicoshotFilterOptions.ignoreErrors', () => {
  const isIgnored = (error: Error) =>
    dicoshotFilterOptions.ignoreErrors?.some((cls) => error instanceof cls) ??
    false;

  it.each([
    [
      'ExternalServiceUnavailableException',
      new ExternalServiceUnavailableException(),
    ],
    [
      'ProgramFormReservationUnavailableException',
      new ProgramFormReservationUnavailableException(),
    ],
  ])('의존 서비스 장애 예외 %s는 알림에서 제외한다', (_name, error) => {
    expect(isIgnored(error)).toBe(true);
  });

  it('의존 서비스 장애가 아닌 도메인 예외는 제외하지 않는다', () => {
    expect(isIgnored(new FormNotFoundException())).toBe(false);
  });
});
