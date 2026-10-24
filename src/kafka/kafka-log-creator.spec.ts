import { Logger } from '@nestjs/common';
import { logLevel } from 'kafkajs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kafkaLogCreator } from './kafka-log-creator.js';

describe('kafkaLogCreator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kafkajs 레벨을 Nest 로거 레벨로 옮기고 module은 kafkajs다', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const write = kafkaLogCreator();
    const entry = {
      namespace: 'Connection',
      label: 'ERROR',
      log: {
        timestamp: '2026-01-01T00:00:00.000Z',
        logger: 'kafkajs',
        message: 'Connection error',
        broker: 'localhost:9092',
      },
    };

    write({ ...entry, level: logLevel.ERROR });
    write({ ...entry, level: logLevel.WARN });
    write({ ...entry, level: logLevel.INFO });

    expect(error).toHaveBeenCalledWith(
      '[Connection] Connection error {"broker":"localhost:9092"}',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect((error.mock.contexts[0] as { context?: string }).context).toBe(
      'kafkajs',
    );
  });
});
