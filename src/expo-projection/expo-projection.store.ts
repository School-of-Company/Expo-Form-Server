import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ExpoPeriod } from '../expo-client/expo-client.interface.js';
import type { ExpoChangedEvent } from './expo-changed-event.js';

/**
 * 프로젝션 조회 결과.
 * - `present`: 박람회가 있고 기간을 안다
 * - `deleted`: 박람회가 지워졌다(tombstone을 받았다) — 박람회 서비스의 404와 같은 뜻이다
 * - `miss`: 이 박람회의 이벤트를 아직 받은 적 없다 — 모르는 것이지 없는 것이 아니다
 */
export type ExpoProjectionLookup =
  | { state: 'present'; period: ExpoPeriod }
  | { state: 'deleted' }
  | { state: 'miss' };

/** 반영 결과. `stale`은 이미 같거나 더 새 버전을 반영해 버린 이벤트다(중복·늦게 도착). */
export type ExpoProjectionApplyResult = 'applied' | 'stale';

/**
 * 박람회 프로젝션(`expo_projection`)과 박람회별 마지막 반영 버전(`expo_projection_version`)을 다룬다.
 */
@Injectable()
export class ExpoProjectionStore {
  constructor(private readonly dataSource: DataSource) {}

  async find(expoId: string): Promise<ExpoProjectionLookup> {
    const rows: Array<{
      deleted: boolean;
      startedDay: string | null;
      finishedDay: string | null;
    }> = await this.dataSource.query(
      `SELECT v.deleted AS "deleted",
              p.started_day::text AS "startedDay",
              p.finished_day::text AS "finishedDay"
         FROM expo_projection_version v
         LEFT JOIN expo_projection p ON p.expo_id = v.expo_id
        WHERE v.expo_id = $1`,
      [expoId],
    );
    const row = rows[0];
    if (row === undefined) {
      return { state: 'miss' };
    }

    if (row.deleted || row.startedDay === null || row.finishedDay === null) {
      return { state: 'deleted' };
    }

    return {
      state: 'present',
      period: { startedDay: row.startedDay, finishedDay: row.finishedDay },
    };
  }

  /**
   * 이벤트 하나로 그 박람회의 프로젝션 전체를 덮어쓰거나(tombstone이면 지우거나) 한다.
   *
   * 버전 행을 "저장된 버전보다 클 때만" 갱신하는 upsert로 먼저 잡고, 갱신됐을 때만 같은 트랜잭션에서
   * 프로젝션을 바꾼다. 같은 박람회 이벤트가 동시에 들어와도 버전 행의 행 락으로 한 줄로 서고, 같은
   * `eventId`의 재전송은 같은 `version`이라 `stale`로 걸러진다.
   */
  async apply(event: ExpoChangedEvent): Promise<ExpoProjectionApplyResult> {
    return this.dataSource.transaction(async (manager) => {
      const claimed: unknown[] = await manager.query(
        `INSERT INTO expo_projection_version (expo_id, version, event_id, deleted, applied_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (expo_id) DO UPDATE
            SET version = EXCLUDED.version,
                event_id = EXCLUDED.event_id,
                deleted = EXCLUDED.deleted,
                applied_at = now()
          WHERE expo_projection_version.version < EXCLUDED.version
         RETURNING expo_id`,
        [event.expoId, event.version, event.eventId, event.deleted],
      );
      if (claimed.length === 0) {
        return 'stale';
      }

      if (event.deleted) {
        await manager.query('DELETE FROM expo_projection WHERE expo_id = $1', [
          event.expoId,
        ]);
        return 'applied';
      }

      await manager.query(
        `INSERT INTO expo_projection (expo_id, started_day, finished_day, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (expo_id) DO UPDATE
            SET started_day = EXCLUDED.started_day,
                finished_day = EXCLUDED.finished_day,
                updated_at = now()`,
        [event.expoId, event.period.startedDay, event.period.finishedDay],
      );
      return 'applied';
    });
  }
}
