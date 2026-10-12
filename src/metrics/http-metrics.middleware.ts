import process from 'node:process';
import type { NextFunction, Request, Response } from 'express';
import { UNMATCHED_URI, type MetricsService } from './metrics.service.js';

/** 응답이 끝나기 전에 클라이언트가 끊은 요청에 쓰는 상태(nginx 관례). */
const CLIENT_CLOSED_STATUS = 499;

/**
 * 모든 요청의 처리 시간을 기록한다. 가드·필터가 거절한 요청(401, 4xx)도 잡으려고 라우팅보다 앞에서 시작하고,
 * 라우트 템플릿은 응답이 끝난 시점에 읽는다 — 그때는 이미 라우트가 매칭되어 있다.
 */
export function createHttpMetricsMiddleware(metrics: MetricsService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    let recorded = false;

    const record = (status: number) => {
      if (recorded) {
        return;
      }

      recorded = true;
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      metrics.recordRequest(
        request.method,
        status,
        routeTemplate(request),
        seconds,
      );
    };

    response.once('finish', () => {
      record(response.statusCode);
    });
    response.once('close', () => {
      record(
        response.writableFinished ? response.statusCode : CLIENT_CLOSED_STATUS,
      );
    });
    next();
  };
}

/** 원문 URL이 아닌 라우트 템플릿. 매칭된 라우트가 없으면 고정 값 하나로 묶는다. */
function routeTemplate(request: Request): string {
  const path: unknown = (request.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${request.baseUrl}${path}` : UNMATCHED_URI;
}
