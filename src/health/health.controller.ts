import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

/** DB가 이 시간 안에 답하지 않으면 끊긴 것으로 본다. 상태 확인이 오래 매달리지 않게 한다. */
export const HEALTH_DB_TIMEOUT_MS = 2000;

export type HealthResponse = { status: 'ok' | 'down' };

/**
 * 상태 확인 경로. DB 연결(`SELECT 1`)이 되면 200, 안 되면 503이다. 인증이 필요 없다.
 *
 * - Kafka는 보지 않는다. 일시적인 Kafka 장애로 서비스 전체를 비정상으로 돌리면 연쇄 장애가 날 수 있고,
 *   Outbox 릴레이가 나중에 다시 발행하기 때문이다.
 * - 응답에는 접속 주소·에러 메시지 같은 내부 정보를 싣지 않는다. 원인은 로그에만 남긴다.
 * - 예외를 던지지 않고 상태 코드로 답한다. 점검 주기마다 Discord 장애 알림이 반복되지 않게 하기 위해서다.
 * - Gateway는 `/forms`, `/surveys` 접두사만 이 서비스로 보내므로 이 경로는 Gateway를 거쳐 닿지 않는다.
 *   서비스 포트로 직접 부르는 점검(배포 스크립트·컨테이너 probe)용이다.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    try {
      await this.pingDatabase();
      return { status: 'ok' };
    } catch (error) {
      this.logger.error('DB 연결 확인 실패', error);
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'down' };
    }
  }

  private async pingDatabase(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`DB 응답 없음(${HEALTH_DB_TIMEOUT_MS}ms)`));
      }, HEALTH_DB_TIMEOUT_MS);
    });

    try {
      await Promise.race([this.dataSource.query('SELECT 1'), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
