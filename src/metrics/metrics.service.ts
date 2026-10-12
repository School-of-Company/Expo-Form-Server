import { Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const STANDARD_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

/** 라우트 템플릿을 알 수 없는 요청(404 등)을 묶는 고정 라벨 값. */
export const UNMATCHED_URI = 'unmatched';

// Spring Micrometer의 기본 SLO 버킷과 가깝게 잡아 같은 쿼리로 합칠 수 있게 한다(공용 대시보드에서 확정).
const LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

/**
 * 공통 메트릭 규약(Expo-Config-Server `docs/metrics-convention.md`)의 HTTP 지표를 기록한다.
 *
 * 라벨은 카디널리티가 낮아야 한다. 원문 경로·쿼리·사용자 ID·번호·토큰을 라벨에 넣지 않는다 —
 * `uri`는 라우트 템플릿(`/forms/by-id/:formId`)만, `method`는 표준 동사만 쓴다.
 */
export class MetricsService {
  // 전역 registry 대신 인스턴스마다 따로 둔다. 테스트에서 여러 번 만들어도 "이미 등록됨" 오류가 없다.
  readonly registry = new Registry();

  private readonly requestDuration = new Histogram({
    name: 'http_server_requests_seconds',
    help: 'HTTP 요청 처리 시간',
    labelNames: ['method', 'status', 'uri'],
    buckets: LATENCY_BUCKETS,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  recordRequest(
    method: string,
    status: number,
    uri: string,
    durationSeconds: number,
  ): void {
    this.requestDuration.observe(
      {
        method: STANDARD_METHODS.has(method) ? method : 'OTHER',
        status: String(status),
        uri,
      },
      durationSeconds,
    );
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
