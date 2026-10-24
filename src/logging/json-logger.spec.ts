/* eslint-disable @typescript-eslint/naming-convention -- 환경 변수 이름과 로그 키(`stack_trace`)는 외부 계약이다. */
import { Writable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { createTraceContext, runWithTrace } from '../tracing/trace-context.js';
import { createPino, JsonLogger, readLogEnv } from './json-logger.js';

function capture(level = 'trace') {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk: Uint8Array, _encoding, callback) {
      lines.push(
        JSON.parse(new TextDecoder().decode(chunk)) as Record<string, unknown>,
      );
      callback();
    },
  });
  const logger = new JsonLogger(
    createPino({ service: 'expo-form-server', level }, stream),
  );
  return { lines, logger };
}

describe('JsonLogger', () => {
  afterEach(() => {
    Logger.overrideLogger(true);
  });

  it('표준 키 다섯 개를 쓰고 Nest 컨텍스트를 module로 쓴다', () => {
    const { lines, logger } = capture();
    Logger.overrideLogger(logger);

    new Logger('Bootstrap').log('started');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'INFO',
      service: 'expo-form-server',
      module: 'Bootstrap',
      message: 'started',
    });
    const timestamp = lines[0]?.['@timestamp'] as string;
    expect(timestamp).toBe(new Date(timestamp).toISOString());
    expect(lines[0]).not.toHaveProperty('pid');
    expect(lines[0]).not.toHaveProperty('hostname');
  });

  it('요청 안의 로그에만 traceId를 붙인다', () => {
    const { lines, logger } = capture();
    const context = createTraceContext();

    runWithTrace(context, () => {
      logger.log('안쪽', 'Survey');
    });
    logger.log('바깥', 'Survey');

    expect(lines[0]).toMatchObject({
      message: '안쪽',
      traceId: context.traceId,
    });
    expect(lines[1]).not.toHaveProperty('traceId');
  });

  it('컨텍스트가 없으면 module은 app이다', () => {
    const { lines, logger } = capture();

    logger.warn('no context');

    expect(lines[0]).toMatchObject({ level: 'WARN', module: 'app' });
  });

  it('error(message, stack, context)의 스택을 컨텍스트와 구분한다', () => {
    const { lines, logger } = capture();
    Logger.overrideLogger(logger);

    new Logger('Relay').error('failed', 'Error: x\n    at foo (a.ts:1:1)');

    expect(lines[0]).toMatchObject({
      level: 'ERROR',
      module: 'Relay',
      message: 'failed',
      stack_trace: 'Error: x\n    at foo (a.ts:1:1)',
    });
  });

  it('fatal은 ERROR, verbose는 TRACE로 쓰고 설정 레벨 아래는 버린다', () => {
    const { lines, logger } = capture();
    logger.fatal(new Error('boom'));
    logger.verbose('detail', 'Ctx');

    expect(lines[0]).toMatchObject({ level: 'ERROR', message: 'boom' });
    expect(lines[0]?.stack_trace).toEqual(expect.stringContaining('boom'));
    expect(lines[1]).toMatchObject({ level: 'TRACE', module: 'Ctx' });

    const quiet = capture('info');
    quiet.logger.debug('hidden');
    expect(quiet.lines).toHaveLength(0);
  });
});

describe('readLogEnv', () => {
  it('local일 때만 파일 미러 위치를 돌려준다', () => {
    expect(readLogEnv({ NODE_ENV: 'local', EXPO_LOG_DIR: '/shared' })).toEqual(
      { level: 'info', logDir: '/shared' },
    );
    expect(readLogEnv({ PROFILE: 'local' }).logDir).toMatch(/\.expo/u);
    expect(readLogEnv({ NODE_ENV: 'production' })).toEqual({ level: 'info' });
  });

  it('잘못된 LOG_LEVEL에도 던지지 않는다', () => {
    expect(readLogEnv({ LOG_LEVEL: 'DEBUG' }).level).toBe('debug');
    expect(readLogEnv({ LOG_LEVEL: 'loud' }).level).toBe('info');
  });
});
