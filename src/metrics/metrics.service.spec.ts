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

  it('외부 호출은 서비스·작업·결과 라벨로 기록한다', async () => {
    const metrics = new MetricsService();
    metrics.recordDownstream({
      service: 'expo',
      operation: 'reserve_update',
      outcome: 'conflict',
      seconds: 0.2,
    });

    const body = await metrics.render();

    expect(body).toContain(
      'form_downstream_calls_seconds_count{service="expo",operation="reserve_update",outcome="conflict"} 1',
    );
  });

  it('릴레이 실행·발행·컨슈머 건너뜀을 고정 라벨로 센다', async () => {
    const metrics = new MetricsService();
    metrics.recordRelayRun('answer', 'ok', 0.4);
    metrics.recordRelayRun('draw', 'skipped');
    metrics.recordPublished('answer', 3, 1);
    metrics.recordPublished('draw', 0, 0);
    metrics.recordConsumerSkipped('unparsable');

    const body = await metrics.render();

    expect(body).toContain(
      'form_outbox_relay_runs_total{outbox="answer",result="ok"} 1',
    );
    expect(body).toContain(
      'form_outbox_relay_runs_total{outbox="draw",result="skipped"} 1',
    );
    expect(body).toContain(
      'form_outbox_relay_duration_seconds_count{outbox="answer"} 1',
    );
    expect(body).toContain(
      'form_outbox_publish_total{outbox="answer",result="ok"} 3',
    );
    expect(body).toContain(
      'form_outbox_publish_total{outbox="answer",result="error"} 1',
    );
    // 0건은 시계열을 만들지 않는다.
    expect(body).not.toContain('form_outbox_publish_total{outbox="draw"');
    expect(body).toContain(
      'form_result_consumer_skipped_total{reason="unparsable"} 1',
    );
  });
});
