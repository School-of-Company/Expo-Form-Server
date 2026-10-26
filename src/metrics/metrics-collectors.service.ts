import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gauge } from 'prom-client';
import { DataSource } from 'typeorm';
import { DEFAULT_MAX_RETRY_COUNT } from '../survey/survey-draw-result-relay.service.js';
import { resolveRelaySettings } from '../survey/survey-answer-relay.config.js';
import { getMetricsRuntime } from './metrics-runtime.js';

/** 집계 결과를 이 시간 동안 재사용한다. 스크레이프가 잦아도(여러 Prometheus, 수동 조회) DB를 매번 훑지 않게 한다. */
const SNAPSHOT_TTL_MS = 10_000;

export type OutboxSnapshot = {
  answer: {
    received: number;
    published: number;
    exhausted: number;
    oldestReceivedAgeSeconds: number;
  };
  draw: {
    unpublished: number;
    exhausted: number;
    oldestUnpublishedAgeSeconds: number;
  };
};

type PoolLike = {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

type AnswerRow = {
  received: number;
  published: number;
  exhausted: number;
  oldest: number | null;
};

type DrawRow = {
  unpublished: number;
  exhausted: number;
  oldest: number | null;
};

/**
 * DB를 읽어야 하는 지표(아웃박스 상태, 연결 풀)를 스크레이프 때 계산해 내보낸다. `MetricsService`는 Nest 컨테이너보다 먼저
 * 만들어지므로 DB 접근이 필요한 게이지는 여기서 그 registry에 뒤늦게 등록한다. 메트릭이 꺼져 있으면 아무것도 하지 않는다.
 *
 * 라벨은 고정 값만 쓴다. 박람회·설문·전화번호·eventId는 카디널리티와 개인정보 때문에 라벨에 넣지 않는다.
 */
@Injectable()
export class MetricsCollectorsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsCollectorsService.name);
  private cached: { at: number; snapshot: OutboxSnapshot } | undefined;
  private refreshing: Promise<void> | undefined;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const registry = getMetricsRuntime()?.service.registry;
    if (registry === undefined) {
      return;
    }

    const records = new Gauge({
      name: 'form_outbox_records',
      help: '아웃박스 건수(상태별)',
      labelNames: ['outbox', 'state'],
      registers: [registry],
      collect: async () => {
        const snapshot = await this.snapshot();
        records.reset();
        if (snapshot === undefined) {
          return;
        }

        records.set(
          { outbox: 'answer', state: 'received' },
          snapshot.answer.received,
        );
        records.set(
          { outbox: 'answer', state: 'published' },
          snapshot.answer.published,
        );
        records.set(
          { outbox: 'answer', state: 'exhausted' },
          snapshot.answer.exhausted,
        );
        records.set(
          { outbox: 'draw', state: 'unpublished' },
          snapshot.draw.unpublished,
        );
        records.set(
          { outbox: 'draw', state: 'exhausted' },
          snapshot.draw.exhausted,
        );
      },
    });

    const oldest = new Gauge({
      name: 'form_outbox_oldest_pending_age_seconds',
      help: '아직 발행하지 못한 가장 오래된 건의 나이(초). 없으면 0',
      labelNames: ['outbox'],
      registers: [registry],
      collect: async () => {
        const snapshot = await this.snapshot();
        oldest.reset();
        if (snapshot === undefined) {
          return;
        }

        oldest.set(
          { outbox: 'answer' },
          snapshot.answer.oldestReceivedAgeSeconds,
        );
        oldest.set(
          { outbox: 'draw' },
          snapshot.draw.oldestUnpublishedAgeSeconds,
        );
      },
    });

    const pool = new Gauge({
      name: 'form_db_pool_connections',
      help: 'DB 연결 풀의 연결 수(total, idle, waiting). waiting이 계속 0보다 크면 풀이 고갈된 것이다',
      labelNames: ['state'],
      registers: [registry],
      collect: async () => {
        // 같은 스크레이프에서 아웃박스 게이지가 집계 쿼리를 띄운다. `pg-pool`은 유휴 연결이 있어도 다음 틱에야
        // 내주므로, 그 사이에 읽으면 유휴 1·대기 1로 잡혀 고갈이 없는데도 FormDbPoolExhausted가 계속 울렸다.
        // 진행 중인 집계가 끝난 뒤에 읽어 지표 자신의 쿼리는 빼고 센다.
        await this.refreshing;
        const counts = this.poolCounts();
        if (counts === undefined) {
          return;
        }

        pool.set({ state: 'total' }, counts.totalCount);
        pool.set({ state: 'idle' }, counts.idleCount);
        pool.set({ state: 'waiting' }, counts.waitingCount);
      },
    });
  }

  /** 집계를 돌려준다. 짧은 시간 안의 중복 요청은 한 번의 쿼리를 공유한다. DB 오류면 `undefined`이고 게이지는 비운다. */
  async snapshot(): Promise<OutboxSnapshot | undefined> {
    const now = Date.now();
    if (this.cached !== undefined && now - this.cached.at < SNAPSHOT_TTL_MS) {
      return this.cached.snapshot;
    }

    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    });
    await this.refreshing;

    return this.cached?.snapshot;
  }

  private async refresh(): Promise<void> {
    const answerMax = resolveRelaySettings((key) =>
      this.config.get(key),
    ).maxRetryCount;
    const drawMax = this.config.get<number>(
      'SURVEY_DRAW_RESULT_MAX_RETRY_COUNT',
      DEFAULT_MAX_RETRY_COUNT,
    );

    try {
      const [answer] = await this.dataSource.query<AnswerRow[]>(
        `SELECT
           count(*) FILTER (WHERE status = 'RECEIVED')::int AS received,
           count(*) FILTER (WHERE status = 'PUBLISHED' AND retry_count < $1)::int AS published,
           count(*) FILTER (WHERE status = 'PUBLISHED' AND retry_count >= $1)::int AS exhausted,
           EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE status = 'RECEIVED'))::float8 AS oldest
         FROM survey_answer_submission
         WHERE status IN ('RECEIVED', 'PUBLISHED')`,
        [answerMax],
      );
      const [draw] = await this.dataSource.query<DrawRow[]>(
        `SELECT
           count(*) FILTER (WHERE retry_count < $1)::int AS unpublished,
           count(*) FILTER (WHERE retry_count >= $1)::int AS exhausted,
           EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE retry_count < $1))::float8 AS oldest
         FROM survey_draw_result
         WHERE published_at IS NULL AND phone_number IS NOT NULL`,
        [drawMax],
      );

      this.cached = {
        at: Date.now(),
        snapshot: {
          answer: {
            received: answer.received,
            published: answer.published,
            exhausted: answer.exhausted,
            oldestReceivedAgeSeconds: answer.oldest ?? 0,
          },
          draw: {
            unpublished: draw.unpublished,
            exhausted: draw.exhausted,
            oldestUnpublishedAgeSeconds: draw.oldest ?? 0,
          },
        },
      };
    } catch (error) {
      // 지표 집계 실패가 스크레이프나 서비스에 영향을 주지 않게 하고, 낡은 값을 그대로 내보내지도 않는다.
      this.cached = undefined;
      this.logger.warn(`아웃박스 지표 집계 실패: ${(error as Error).message}`);
    }
  }

  /** `pg` 풀의 연결 수. TypeORM이 풀을 아직 만들지 않았으면 `undefined`. */
  private poolCounts(): PoolLike | undefined {
    const pool = (this.dataSource.driver as unknown as { master?: PoolLike })
      .master;
    return pool === undefined
      ? undefined
      : {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        };
  }
}
