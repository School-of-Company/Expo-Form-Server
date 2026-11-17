import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyLotteryParticipantEntity } from './entities/survey-lottery-participant.entity.js';

/**
 * 릴레이가 잡은 결과를 다른 인스턴스가 다시 잡지 않는 기간. 한 배치(최대 100건)를 순서대로 발행하기에 충분히 길고,
 * 발행 도중 죽은 인스턴스의 몫을 너무 오래 묶어 두지 않을 만큼 짧다. 발행이 이보다 오래 걸려 다른 인스턴스가 다시
 * 잡더라도 `eventId`가 같아 알림 서비스가 중복을 거른다.
 */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** {@link SurveyDrawResultStore.relayUnpublished}에서 발행에 실패한 건. */
export type DrawRelayFailure = {
  result: SurveyDrawResultEntity;
  error: unknown;
  /** 이번 실패까지 포함한 누적 실패 횟수. */
  retryCount: number;
};

/** 경품 당첨 결과(아웃박스) 영속성 접근을 한 곳에 모아둔 store. */
@Injectable()
export class SurveyDrawResultStore {
  constructor(
    @InjectRepository(SurveyDrawResultEntity)
    private readonly drawResults: Repository<SurveyDrawResultEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 아직 발행하지 않았고 문자를 보낼 번호가 있는 결과를 오래된 순서로 잡아 `publish`로 하나씩 발행한다.
   * 결과에는 설문(`survey`)이 함께 실려 있다. 번호 없이 당첨된 기록과, 실패가 `maxRetryCount`에 닿아 포기한 기록은 제외한다.
   *
   * 짧은 트랜잭션에서 행을 `FOR UPDATE SKIP LOCKED`로 잠가 `claimedUntil`(잡은 시각 + {@link CLAIM_LEASE_MS})을
   * 표시하고 바로 커밋한다. 발행은 트랜잭션 밖에서 하므로 Kafka가 느려도 DB 연결과 행 잠금을 쥐고 있지 않는다.
   * 잡은 기간이 남은 행은 다른 인스턴스가 읽지 않아 같은 당첨 문자를 두 번 보내지 않는다.
   *
   * 발행에 성공하면 `publishedAt`을 채우고, `publish`가 던지면 실패 횟수를 올리며 잡은 표시를 풀어 다음 주기에 다시
   * 시도한다. 발행 도중 프로세스가 죽으면 잡은 기간이 지난 뒤 다시 발행되는데, `eventId`가 그대로라 알림 서비스가
   * 중복을 거른다.
   *
   * @returns 실패한 건과, 그 실패까지 포함한 누적 실패 횟수
   */
  async relayUnpublished(
    limit: number,
    maxRetryCount: number,
    publish: (result: SurveyDrawResultEntity) => Promise<void>,
  ): Promise<DrawRelayFailure[]> {
    const claimedUntil = new Date(Date.now() + CLAIM_LEASE_MS);
    const results = await this.claimUnpublished(
      limit,
      maxRetryCount,
      claimedUntil,
    );

    const failures: DrawRelayFailure[] = [];
    for (const result of results) {
      try {
        // 한 건씩 순서대로 발행한다. Kafka에 한꺼번에 몰아넣지 않는다.
        // eslint-disable-next-line no-await-in-loop
        await publish(result);
      } catch (error) {
        // 잡은 기간이 지나 다른 인스턴스가 다시 잡았으면 그쪽 표시를 건드리지 않는다.
        // eslint-disable-next-line no-await-in-loop
        await this.drawResults.update(
          { id: result.id, claimedUntil },
          { claimedUntil: null, retryCount: () => 'retry_count + 1' },
        );
        failures.push({ result, error, retryCount: result.retryCount + 1 });
        continue;
      }

      // 표시에 실패하면(DB 오류) 잡은 기간이 지난 뒤 다시 발행한다. `eventId`가 같아 중복은 걸러진다.
      // eslint-disable-next-line no-await-in-loop
      await this.drawResults.update(result.id, {
        publishedAt: new Date(),
        claimedUntil: null,
      });
    }

    return failures;
  }

  /** 발행할 결과를 잠가 읽고 `claimedUntil`을 표시한 뒤 커밋한다. */
  private async claimUnpublished(
    limit: number,
    maxRetryCount: number,
    claimedUntil: Date,
  ): Promise<SurveyDrawResultEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const results = await manager
        .createQueryBuilder(SurveyDrawResultEntity, 'result')
        // 이벤트에 박람회 id를 싣기 위해 설문을 함께 읽는다. 잠금은 결과 행에만 건다 — 설문 행은 공개 답변 제출이
        // 당첨 판정 동안 잠그므로, 같이 잠그면 제출이 몰릴 때 릴레이가 그 설문의 결과를 건너뛰게 된다.
        .innerJoinAndSelect('result.survey', 'survey')
        .setLock('pessimistic_write', undefined, ['result'])
        .setOnLocked('skip_locked')
        .where('result.publishedAt IS NULL')
        .andWhere('result.phoneNumber IS NOT NULL')
        .andWhere('result.retryCount < :maxRetryCount', { maxRetryCount })
        .andWhere(
          '(result.claimedUntil IS NULL OR result.claimedUntil <= now())',
        )
        .orderBy('result.createdAt', 'ASC')
        .limit(limit)
        .getMany();

      if (results.length > 0) {
        await manager.update(
          SurveyDrawResultEntity,
          { id: In(results.map((result) => result.id)) },
          { claimedUntil },
        );
      }

      return results;
    });
  }

  /**
   * 아직 전화번호가 남아 있는 박람회 id 목록 — 당첨 결과의 번호나 추첨 참여 번호가 있는 곳. 정리 대상 박람회를
   * 고를 때 쓴다.
   */
  async findExpoIdsWithPhoneNumbers(): Promise<string[]> {
    const rows = await this.drawResults.query<Array<{ expoId: string }>>(
      `SELECT DISTINCT s.expo_id AS "expoId" FROM survey s
       WHERE EXISTS (SELECT 1 FROM survey_draw_result r WHERE r.survey_id = s.id AND r.phone_number IS NOT NULL)
          OR EXISTS (SELECT 1 FROM survey_lottery_participant p WHERE p.survey_id = s.id)`,
    );

    return rows.map((row) => row.expoId);
  }

  /**
   * 박람회의 전화번호를 지운다. 당첨 결과에서는 번호만 지워 당첨 순번과 발행 기록을 남기고, 추첨 참여 기록은
   * 번호뿐이라 행을 지운다.
   *
   * @returns 지운 번호 건수(당첨 결과 + 참여 기록)
   */
  async clearPhoneNumbers(expoId: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      // 서브쿼리를 문자열로 직접 쓰면 `survey`가 이 엔티티의 관계 속성 이름과 같아 TypeORM이 컬럼명으로 바꿔 버린다.
      // 엔티티로 만든 서브쿼리를 쓰면 테이블 이름이 정확히 나간다.
      const surveyIds = manager
        .createQueryBuilder()
        .select('survey.id')
        .from(SurveyEntity, 'survey')
        .where('survey.expoId = :expoId')
        .getQuery();

      const cleared = await manager
        .createQueryBuilder()
        .update(SurveyDrawResultEntity)
        .set({ phoneNumber: null })
        .where('phone_number IS NOT NULL')
        .andWhere(`survey_id IN (${surveyIds})`)
        .setParameter('expoId', expoId)
        .execute();
      const deleted = await manager
        .createQueryBuilder()
        .delete()
        .from(SurveyLotteryParticipantEntity)
        .where(`survey_id IN (${surveyIds})`)
        .setParameter('expoId', expoId)
        .execute();

      return (cleared.affected ?? 0) + (deleted.affected ?? 0);
    });
  }
}
