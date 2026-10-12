import type { MetricsBind } from './metrics.config.js';
import type { MetricsService } from './metrics.service.js';

type MetricsRuntime = {
  readonly service: MetricsService;
  /** 실제로 listener가 열린 주소. 꺼졌거나 열지 못했으면 없다. */
  readonly bind?: MetricsBind;
};

let current: MetricsRuntime | undefined;

/**
 * 부팅 때 listener를 먼저 열고 그 결과를 여기에 둔다. Eureka 등록 옵션이 "실제로 열린 포트"만
 * metadata에 싣도록, Nest 컨테이너를 만들기 전에 정해져 있어야 해서 모듈 밖의 holder를 쓴다.
 */
export function setMetricsRuntime(runtime: MetricsRuntime | undefined): void {
  current = runtime;
}

export function getMetricsRuntime(): MetricsRuntime | undefined {
  return current;
}
