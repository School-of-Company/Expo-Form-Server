export type MetricsBind = {
  host: string;
  port: number;
};

/** 환경 변수 조회 함수. `process.env[key]`나 `ConfigService.get`을 그대로 넘긴다. */
export type EnvReader = (key: string) => string | undefined;

/** 메트릭 listener를 열지 정한다. 기본은 켜짐이고, `false`로 끈다. */
export function readMetricsEnabled(env: EnvReader): boolean {
  const value = env('METRICS_ENABLED') ?? 'true';
  if (value !== 'true' && value !== 'false') {
    throw new Error('Invalid METRICS_ENABLED: must be true or false');
  }

  return value === 'true';
}

/**
 * 메트릭 listener의 바인드 주소. 서비스 포트(`PORT`)와 분리된 listener라서 기본은 loopback이다 —
 * 외부 인터페이스에 `/metrics`가 열리지 않게 하려는 것이다. Prometheus가 loopback에 닿지 못하면
 * `METRICS_HOST`를 인스턴스의 사설 IP(또는 방화벽 안쪽의 `0.0.0.0`)로 준다.
 */
export function readMetricsBind(env: EnvReader): MetricsBind {
  const host = env('METRICS_HOST') ?? '127.0.0.1';
  if (host.trim() === '') {
    throw new Error('Invalid METRICS_HOST: must not be empty');
  }

  const rawPort = env('METRICS_PORT') ?? '9464';
  const port = Number(rawPort);
  if (!/^\d+$/u.test(rawPort) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid METRICS_PORT: ${rawPort}`);
  }

  return { host, port };
}
