import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { getMetricsRuntime, setMetricsRuntime } from './metrics-runtime.js';
import { startMetrics } from './start-metrics.js';

const envOf = (entries: Array<[string, string]>) => {
  const env = new Map(entries);
  return (key: string) => env.get(key);
};

describe('startMetrics', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    setMetricsRuntime(undefined);
    vi.restoreAllMocks();
    await Promise.all(
      servers.splice(0).map(
        async (server) =>
          new Promise((resolve) => {
            server.close(resolve);
          }),
      ),
    );
  });

  async function freePort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const { port } = probe.address() as AddressInfo;
    await new Promise((resolve) => {
      probe.close(resolve);
    });
    return port;
  }

  it('꺼져 있으면 listener도 bind도 없다', async () => {
    await expect(
      startMetrics(envOf([['METRICS_ENABLED', 'false']])),
    ).resolves.toBe(undefined);
    expect(getMetricsRuntime()).toBeUndefined();
  });

  it('열리면 실제로 연 주소를 runtime에 남긴다', async () => {
    const port = await freePort();

    const started = await startMetrics(envOf([['METRICS_PORT', String(port)]]));
    if (started?.server !== undefined) {
      servers.push(started.server);
    }

    expect(started?.service).toBeDefined();
    expect(getMetricsRuntime()?.bind).toEqual({ host: '127.0.0.1', port });
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(response.status).toBe(200);
  });

  it('포트를 열지 못하면 서비스는 계속 뜨되 bind를 남기지 않는다', async () => {
    const occupied = createServer();
    servers.push(occupied);
    await new Promise<void>((resolve) => {
      occupied.listen(0, '127.0.0.1', resolve);
    });
    const { port } = occupied.address() as AddressInfo;

    const started = await startMetrics(envOf([['METRICS_PORT', String(port)]]));

    expect(started?.service).toBeDefined();
    expect(started?.server).toBeUndefined();
    expect(getMetricsRuntime()?.bind).toBeUndefined();
  });
});
