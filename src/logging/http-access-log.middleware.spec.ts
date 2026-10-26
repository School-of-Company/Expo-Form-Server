import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  createTraceContext,
  currentTrace,
  runWithTrace,
} from '../tracing/trace-context.js';
import {
  createHttpAccessLogMiddleware,
  isHttpAccessLogEnabled,
} from './http-access-log.middleware.js';

type FakeResponse = EventEmitter & {
  statusCode: number;
  writableFinished: boolean;
};

const setup = (request: Partial<Request>) => {
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  // Express의 Response는 Node 스트림(EventEmitter)이라 같은 이벤트 모델로 흉내 낸다.
  // eslint-disable-next-line unicorn/prefer-event-target
  const response: FakeResponse = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
  });
  const next = vi.fn<() => void>();
  createHttpAccessLogMiddleware(logger)(
    {
      method: 'GET',
      path: '/forms/1',
      originalUrl: '/forms/1',
      baseUrl: '',
      ...request,
    } as Request,
    response as unknown as Response,
    next,
  );
  return { logger, response, next };
};

describe('createHttpAccessLogMiddleware', () => {
  it('응답이 끝나면 라우트 템플릿·상태·시간을 한 번만 남긴다', () => {
    const { logger, response, next } = setup({
      route: { path: '/forms/:id' },
    });

    response.statusCode = 200;
    response.writableFinished = true;
    response.emit('finish');
    response.emit('close');

    expect(next).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log.mock.calls[0]?.[0]).toMatch(
      /^GET \/forms\/:id 200 \d+ms$/u,
    );
  });

  it('4xx는 WARN, 5xx는 ERROR로 남긴다', () => {
    const client = setup({ route: { path: '/forms/:id' } });
    client.response.statusCode = 409;
    client.response.emit('finish');
    expect(client.logger.warn).toHaveBeenCalledOnce();

    const server = setup({ route: { path: '/forms/:id' } });
    server.response.statusCode = 503;
    server.response.emit('finish');
    expect(server.logger.error).toHaveBeenCalledOnce();
  });

  it('응답 전에 연결이 끊기면 499로 ERROR를 남긴다', () => {
    const { logger, response } = setup({ route: { path: '/forms/:id' } });

    response.emit('close');

    expect(logger.error.mock.calls[0]?.[0]).toMatch(/ 499 \d+ms$/u);
  });

  it('매칭된 라우트가 없으면 쿼리를 뗀 경로를 남긴다', () => {
    const { logger, response } = setup({
      path: '/nope',
      originalUrl: '/nope?phoneNumber=01012345678',
    });

    response.statusCode = 404;
    response.emit('finish');

    const message = String(logger.warn.mock.calls[0]?.[0]);
    expect(message).toMatch(/^GET \/nope 404 \d+ms$/u);
    expect(message).not.toContain('010');
  });

  it('상태 확인 경로는 남기지 않는다', () => {
    const { logger, response, next } = setup({
      path: '/health',
      originalUrl: '/health',
    });

    response.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('미들웨어 시점의 trace 컨텍스트 안에서 남긴다', () => {
    const context = createTraceContext();
    let seen: string | undefined;
    const logger = {
      log: vi.fn(() => {
        seen = currentTrace()?.traceId;
      }),
      warn: vi.fn(),
      error: vi.fn(),
    };
    // eslint-disable-next-line unicorn/prefer-event-target
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: true,
    });

    runWithTrace(context, () => {
      createHttpAccessLogMiddleware(logger)(
        {
          method: 'GET',
          path: '/forms/1',
          originalUrl: '/forms/1',
          baseUrl: '',
        } as Request,
        response as unknown as Response,
        vi.fn<() => void>(),
      );
    });
    // 컨텍스트 밖에서 이벤트가 와도 잡아 둔 trace로 남긴다.
    response.emit('finish');

    expect(seen).toBe(context.traceId);
  });
});

describe('isHttpAccessLogEnabled', () => {
  it('false일 때만 끈다', () => {
    expect(isHttpAccessLogEnabled(undefined)).toBe(true);
    expect(isHttpAccessLogEnabled('')).toBe(true);
    expect(isHttpAccessLogEnabled('true')).toBe(true);
    expect(isHttpAccessLogEnabled(' FALSE ')).toBe(false);
  });
});
