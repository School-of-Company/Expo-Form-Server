import { describe, expect, it } from 'vitest';
import {
  createTraceContext,
  currentTrace,
  formatTraceparent,
  parseTraceparent,
  runWithTrace,
} from './trace-context.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';

describe('trace context', () => {
  it('유효한 traceparent는 같은 trace에 이어 붙고 span id는 새로 만든다', () => {
    const context = createTraceContext(`00-${TRACE_ID}-${SPAN_ID}-01`);

    expect(context.traceId).toBe(TRACE_ID);
    expect(context.spanId).toMatch(/^[0-9a-f]{16}$/u);
    expect(context.spanId).not.toBe(SPAN_ID);
    expect(context.sampled).toBe(true);
  });

  it('sampled 플래그를 그대로 따른다', () => {
    expect(createTraceContext(`00-${TRACE_ID}-${SPAN_ID}-00`).sampled).toBe(
      false,
    );
  });

  it.each([
    undefined,
    '',
    'garbage',
    `01-${TRACE_ID}-${SPAN_ID}-01`,
    `00-${'0'.repeat(32)}-${SPAN_ID}-01`,
    `00-${TRACE_ID}-${'0'.repeat(16)}-01`,
    `00-${TRACE_ID.slice(1)}-${SPAN_ID}-01`,
  ])('잘못된 헤더(%s)면 새 trace를 시작한다', (header) => {
    expect(parseTraceparent(header)).toBeUndefined();
    expect(createTraceContext(header).traceId).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('대문자 헤더도 받는다', () => {
    expect(
      parseTraceparent(`00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01`)?.traceId,
    ).toBe(TRACE_ID);
  });

  it('traceparent 형식으로 직렬화한다', () => {
    expect(
      formatTraceparent({ traceId: TRACE_ID, spanId: SPAN_ID, sampled: true }),
    ).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
  });

  it('runWithTrace 안(비동기 포함)에서만 현재 trace가 보인다', async () => {
    const context = createTraceContext();
    expect(currentTrace()).toBeUndefined();

    await runWithTrace(context, async () => {
      await Promise.resolve();
      expect(currentTrace()).toBe(context);
    });

    expect(currentTrace()).toBeUndefined();
  });
});
