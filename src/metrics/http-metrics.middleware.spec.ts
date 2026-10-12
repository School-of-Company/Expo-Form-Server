import express from 'express';
import request from 'supertest';
import { createHttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsService } from './metrics.service.js';

function buildApp(metrics: MetricsService) {
  const app = express();
  app.use(createHttpMetricsMiddleware(metrics));
  app.get('/forms/by-id/:formId', (_request, response) => {
    response.json({ ok: true });
  });
  const nested = express.Router();
  nested.post('/:expoId/program-forms', (_request, response) => {
    response.status(201).end();
  });
  app.use('/forms/expos', nested);
  return app;
}

describe('createHttpMetricsMiddleware', () => {
  it('uri에는 원문 경로가 아니라 라우트 템플릿을 쓴다', async () => {
    const metrics = new MetricsService();
    const app = buildApp(metrics);

    await request(app).get('/forms/by-id/secret-form-id?token=abc').expect(200);
    const body = await metrics.render();

    expect(body).toContain('uri="/forms/by-id/:formId"');
    expect(body).not.toContain('secret-form-id');
    expect(body).not.toContain('token=abc');
  });

  it('중첩 라우터의 템플릿도 접두사까지 이어 붙인다', async () => {
    const metrics = new MetricsService();

    await request(buildApp(metrics))
      .post('/forms/expos/expo-1/program-forms')
      .expect(201);

    expect(await metrics.render()).toContain(
      'method="POST",status="201",uri="/forms/expos/:expoId/program-forms"',
    );
  });

  it('매칭된 라우트가 없는 요청(404)은 unmatched 하나로 묶는다', async () => {
    const metrics = new MetricsService();

    await request(buildApp(metrics)).get('/random/user-123').expect(404);
    const body = await metrics.render();

    expect(body).toContain('status="404",uri="unmatched"');
    expect(body).not.toContain('user-123');
  });
});
