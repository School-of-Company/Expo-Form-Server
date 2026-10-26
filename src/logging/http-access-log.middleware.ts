import process from 'node:process';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { currentTrace, runWithTrace } from '../tracing/trace-context.js';

/** 응답이 끝나기 전에 클라이언트가 끊은 요청에 쓰는 상태(nginx 관례, 메트릭 미들웨어와 같다). */
const CLIENT_CLOSED_STATUS = 499;
const MAX_PATH_LENGTH = 200;
/** 운영 상태 확인처럼 주기적으로 들어와 로그만 늘리는 경로. */
const SKIPPED_PATHS = new Set(['/health']);

type AccessLogger = Pick<Logger, 'log' | 'warn' | 'error'>;

/**
 * 요청마다 응답이 끝난 시점에 한 줄을 남긴다: `GET /forms/:id 200 12ms`.
 *
 * 경로는 매칭된 라우트 템플릿을 쓰고, 매칭되지 않았으면 쿼리를 뗀 원문 경로를 쓴다 — 쿼리와 경로 값에는
 * 전화번호 같은 개인정보가 실릴 수 있다. 헤더·쿠키·본문은 남기지 않는다. 레벨은 4xx가 WARN, 5xx와 499가 ERROR다.
 * trace 컨텍스트는 미들웨어 시점에 잡아 둔다 — `finish` 콜백에서는 AsyncLocalStorage가 끊길 수 있다.
 */
export function createHttpAccessLogMiddleware(
  logger: AccessLogger = new Logger('HttpAccess'),
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (SKIPPED_PATHS.has(request.path)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    const trace = currentTrace();
    let logged = false;

    const write = (status: number) => {
      if (logged) {
        return;
      }

      logged = true;
      const ms = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
      const message = `${request.method} ${loggablePath(request)} ${status} ${ms}ms`;
      const emit = () => {
        if (status === CLIENT_CLOSED_STATUS || status >= 500) {
          logger.error(message);
        } else if (status >= 400) {
          logger.warn(message);
        } else {
          logger.log(message);
        }
      };

      if (trace === undefined) {
        emit();
      } else {
        runWithTrace(trace, emit);
      }
    };

    response.once('finish', () => {
      write(response.statusCode);
    });
    response.once('close', () => {
      write(
        response.writableFinished ? response.statusCode : CLIENT_CLOSED_STATUS,
      );
    });
    next();
  };
}

/** 라우트 템플릿, 없으면 쿼리를 뗀 원문 경로(길이 제한). */
function loggablePath(request: Request): string {
  const route: unknown = (request.route as { path?: unknown } | undefined)
    ?.path;
  if (typeof route === 'string') {
    return `${request.baseUrl}${route}`;
  }

  const path = request.originalUrl.split('?', 1)[0] ?? '';
  return path.length > MAX_PATH_LENGTH
    ? `${path.slice(0, MAX_PATH_LENGTH)}…`
    : path;
}

/** `HTTP_ACCESS_LOG_ENABLED=false`일 때만 끈다. */
export function isHttpAccessLogEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== 'false';
}
