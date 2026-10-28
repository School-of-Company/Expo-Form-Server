import { Logger } from '@nestjs/common';
import { ProjectionMissLogger } from './projection-miss-logger.js';

describe('ProjectionMissLogger', () => {
  let logger: Logger;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger('test');
    log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
  });

  it('같은 키는 한 번만 남긴다', () => {
    const misses = new ProjectionMissLogger(logger);

    misses.record('a', 'miss a');
    misses.record('a', 'miss a');
    misses.record('b', 'miss b');

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenNthCalledWith(1, 'miss a');
    expect(log).toHaveBeenNthCalledWith(2, 'miss b');
  });

  it('기억하는 키가 상한에 닿으면 비우고 다시 센다', () => {
    const misses = new ProjectionMissLogger(logger, 2);

    misses.record('a', 'miss a');
    misses.record('b', 'miss b');
    misses.record('c', 'miss c');
    misses.record('a', 'miss a');

    expect(log).toHaveBeenCalledTimes(4);
  });
});
