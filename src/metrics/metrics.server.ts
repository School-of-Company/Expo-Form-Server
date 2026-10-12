import { createServer, type Server } from 'node:http';
import type { MetricsService } from './metrics.service.js';

/**
 * 서비스 포트와 분리된 listener에서 `GET /metrics`만 응답한다. 공개 포트에 두면 Gateway의 JWT·rate limit을
 * 거치지 않고 밖으로 노출될 수 있어서, 별도 포트로 연다.
 */
export async function startMetricsServer(
  metrics: MetricsService,
  port: number,
  host: string,
): Promise<Server> {
  const server = createServer((req, res) => {
    const [path] = (req.url ?? '').split('?', 1);
    if (path !== '/metrics' || req.method !== 'GET') {
      res.writeHead(404).end();
      return;
    }

    metrics
      .render()
      .then((body) => {
        res.writeHead(200, { 'Content-Type': metrics.contentType }).end(body);
      })
      .catch(() => {
        res.writeHead(500).end();
      });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
