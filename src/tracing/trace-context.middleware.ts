import type { NextFunction, Request, Response } from 'express';
import { createTraceContext, runWithTrace } from './trace-context.js';

/**
 * 요청마다 trace 컨텍스트를 만들어 이후의 로그·외부 호출이 쓰게 한다. 게이트웨이가 `traceparent`를 넘기면
 * 같은 trace에 이어 붙고, 없으면 여기서 시작한다. 응답의 `X-Trace-Id`로 클라이언트·운영자가 로그를 찾을 수 있다.
 */
export function traceContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const context = createTraceContext(request.header('traceparent'));
  response.setHeader('X-Trace-Id', context.traceId);
  runWithTrace(context, next);
}
