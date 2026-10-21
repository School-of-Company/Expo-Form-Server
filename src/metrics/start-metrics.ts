import type { Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { setDownstreamObserver } from '../common/http/downstream-observer.js';
import {
  readMetricsBind,
  readMetricsEnabled,
  type EnvReader,
} from './metrics.config.js';
import { setMetricsRuntime } from './metrics-runtime.js';
import { startMetricsServer } from './metrics.server.js';
import { MetricsService } from './metrics.service.js';

/**
 * 메트릭 listener를 열고 결과를 {@link setMetricsRuntime}에 남긴다. 꺼져 있거나 포트를 열지 못하면 서비스는
 * 그대로 뜨고, `bind`가 비어 있어서 Eureka에 수집 metadata가 실리지 않는다(없는 포트를 수집하러 가지 않게).
 */
export async function startMetrics(
  env: EnvReader,
): Promise<{ service: MetricsService; server?: Server } | undefined> {
  const logger = new Logger('Metrics');

  if (!readMetricsEnabled(env)) {
    setMetricsRuntime(undefined);
    setDownstreamObserver(undefined);
    logger.log('METRICS_ENABLED=false: 메트릭 listener를 열지 않습니다.');
    return undefined;
  }

  const bind = readMetricsBind(env);
  const service = new MetricsService();
  setDownstreamObserver((sample) => {
    service.recordDownstream(sample);
  });
  let server: Server;
  try {
    server = await startMetricsServer(service, bind.port, bind.host);
  } catch (error) {
    // 메트릭 때문에 서비스 기동을 막지 않는다. 대신 수집 metadata도 등록하지 않는다.
    setMetricsRuntime({ service });
    logger.error(
      `메트릭 listener를 ${bind.host}:${bind.port}에 열지 못했습니다. 수집 등록 없이 계속합니다.`,
      error,
    );
    return { service };
  }

  setMetricsRuntime({ service, bind });
  logger.log(`메트릭 listener: http://${bind.host}:${bind.port}/metrics`);
  return { service, server };
}
