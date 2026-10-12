import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  it('공통 규약 이름과 method·status·uri 라벨로 히스토그램을 내보낸다', async () => {
    const metrics = new MetricsService();
    metrics.recordRequest('GET', 200, '/forms/by-id/:formId', 0.03);

    const body = await metrics.render();

    expect(body).toContain('# TYPE http_server_requests_seconds histogram');
    expect(body).toContain(
      'http_server_requests_seconds_bucket{le="0.05",method="GET",status="200",uri="/forms/by-id/:formId"} 1',
    );
    expect(body).toContain(
      'http_server_requests_seconds_count{method="GET",status="200",uri="/forms/by-id/:formId"} 1',
    );
  });

  it('표준이 아닌 메서드는 OTHER로 묶는다', async () => {
    const metrics = new MetricsService();
    metrics.recordRequest('BREW', 418, 'unmatched', 0.001);

    expect(await metrics.render()).toContain('method="OTHER"');
  });

  it('런타임 기본 지표를 함께 내보낸다', async () => {
    expect(await new MetricsService().render()).toContain(
      'process_cpu_user_seconds_total',
    );
  });
});
