import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let query: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  let controller: HealthController;
  const response = () => ({ status }) as unknown as Response;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    query = vi.fn();
    status = vi.fn();
    controller = new HealthController({ query } as unknown as DataSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('DB가 답하면 ok를 돌려주고 상태 코드는 건드리지 않는다', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check(response())).resolves.toEqual({
      status: 'ok',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(status).not.toHaveBeenCalled();
  });

  it('DB 연결이 끊기면 503과 down을 돌려주고 내부 정보는 싣지 않는다', async () => {
    query.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.9:5432'));

    const result = await controller.check(response());

    expect(status).toHaveBeenCalledWith(503);
    expect(result).toEqual({ status: 'down' });
    expect(JSON.stringify(result)).not.toContain('10.0.0.9');
  });

  it('DB가 시간 안에 답하지 않으면 매달리지 않고 503이다', async () => {
    vi.useFakeTimers();
    query.mockReturnValue(
      new Promise(() => {
        // 영원히 끝나지 않는 쿼리
      }),
    );

    const pending = controller.check(response());
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toEqual({ status: 'down' });
    expect(status).toHaveBeenCalledWith(503);
  });
});
