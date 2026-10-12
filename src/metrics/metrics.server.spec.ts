import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { startMetricsServer } from './metrics.server.js';
import { MetricsService } from './metrics.service.js';

describe('startMetricsServer', () => {
  let server: Server | undefined;

  afterEach(async () => {
    const closing = server;
    server = undefined;
    if (closing?.listening === true) {
      await new Promise((resolve) => {
        closing.close(resolve);
      });
    }
  });

  it('GET /metrics만 응답하고 그 밖의 경로·메서드는 404다', async () => {
    const metrics = new MetricsService();
    metrics.recordRequest('GET', 200, '/health', 0.01);
    server = await startMetricsServer(metrics, 0, '127.0.0.1');

    const ok = await request(server).get('/metrics?x=1').expect(200);
    expect(ok.headers['content-type']).toContain('text/plain');
    expect(ok.text).toContain('http_server_requests_seconds_bucket');

    await request(server).get('/other').expect(404);
    await request(server).post('/metrics').expect(404);
  });

  it('포트가 이미 쓰이고 있으면 reject한다', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => {
      occupied.listen(0, '127.0.0.1', resolve);
    });
    const { port } = occupied.address() as AddressInfo;

    try {
      await expect(
        startMetricsServer(new MetricsService(), port, '127.0.0.1'),
      ).rejects.toThrow(/EADDRINUSE/u);
    } finally {
      occupied.close();
    }
  });
});
