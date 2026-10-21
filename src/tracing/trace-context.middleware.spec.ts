import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { currentTrace } from './trace-context.js';
import { traceContextMiddleware } from './trace-context.middleware.js';

describe('traceContextMiddleware', () => {
  it('trace를 만들어 다음 핸들러에서 보이게 하고 X-Trace-Id를 응답에 싣는다', () => {
    const setHeader = vi.fn();
    let seen: string | undefined;

    traceContextMiddleware(
      { header: () => undefined } as unknown as Request,
      { setHeader } as unknown as Response,
      () => {
        seen = currentTrace()?.traceId;
      },
    );

    expect(seen).toMatch(/^[0-9a-f]{32}$/u);
    expect(setHeader).toHaveBeenCalledWith('X-Trace-Id', seen);
  });
});
