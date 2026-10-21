import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { createTraceContext, runWithTrace } from './trace-context.js';
import { TraceLogger } from './trace-logger.js';

describe('TraceLogger', () => {
  it('요청 안의 로그에는 trace를 붙이고 밖의 로그에는 붙이지 않는다', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new TraceLogger('T');
    const context = createTraceContext();

    runWithTrace(context, () => {
      logger.log('안쪽');
    });
    logger.log('바깥');
    const lines = write.mock.calls.map(([line]) => String(line));
    write.mockRestore();

    expect(lines[0]).toContain('안쪽');
    expect(lines[0]).toContain(`trace=${context.traceId}`);
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(lines[1]).toContain('바깥');
    expect(lines[1]).not.toContain('trace=');
  });
});
