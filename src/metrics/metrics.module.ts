import { Module } from '@nestjs/common';
import { MetricsCollectorsService } from './metrics-collectors.service.js';

/** DB를 읽는 지표(아웃박스 상태, 연결 풀)를 등록한다. 메트릭이 꺼져 있으면 아무것도 하지 않는다. */
@Module({ providers: [MetricsCollectorsService] })
export class MetricsModule {}
