import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';

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
   * 아직 발행하지 않았고 문자를 보낼 번호가 있는 결과를 오래된 순서로 잠가서 `publish`로 하나씩 발행한다.
   * 결과에는 설문(`survey`)이 함께 실려 있다. 번호 없이 당첨된 기록과, 실패가 `maxRetryCount`에 닿아 포기한 기록은 제외한다.
   *
   * 조회와 발행·표시를 한 트랜잭션에 두고 행을 `FOR UPDATE SKIP LOCKED`로 잡는다. 인스턴스가 여러 대여도 같은
   * 행을 둘이 동시에 읽지 못하므로 같은 당첨 문자를 두 번 보내지 않는다. 발행 도중 프로세스가 죽으면 잠금이 풀려
   * 다음 주기에 다시 발행되는데, `eventId`가 그대로라 알림 서비스가 중복을 거른다. 대신 발행하는 동안 DB 연결과
   * 행 잠금을 쥐고 있으므로 한 번에 다루는 건수(`limit`)를 작게 유지해야 한다.
   *
   * `publish`가 던지면 그 건의 실패 횟수를 올리고 다음 건으로 넘어간다.
   *
   * @returns 실패한 건과, 그 실패까지 포함한 누적 실패 횟수
   */
  async relayUnpublished(
    limit: number,
    maxRetryCount: number,
    publish: (result: SurveyDrawResultEntity) => Promise<void>,
  ): Promise<DrawRelayFailure[]> {
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
        .orderBy('result.createdAt', 'ASC')
        .limit(limit)
        .getMany();

      const failures: DrawRelayFailure[] = [];
      for (const result of results) {
        try {
          // 한 건씩 순서대로 발행한다. Kafka에 한꺼번에 몰아넣지 않는다.
          // eslint-disable-next-line no-await-in-loop
          await publish(result);
        } catch (error) {
          // eslint-disable-next-line no-await-in-loop
          await manager.increment(
            SurveyDrawResultEntity,
            { id: result.id },
            'retryCount',
            1,
          );
          failures.push({ result, error, retryCount: result.retryCount + 1 });
          continue;
        }

        // 표시에 실패하면(DB 오류) 트랜잭션이 롤백되어 다음 주기에 다시 발행한다. `eventId`가 같아 중복은 걸러진다.
        // eslint-disable-next-line no-await-in-loop
        await manager.update(SurveyDrawResultEntity, result.id, {
          publishedAt: new Date(),
        });
      }

      return failures;
    });
  }

  /** 아직 전화번호가 남아 있는 당첨 결과가 있는 박람회 id 목록. 정리 대상 박람회를 고를 때 쓴다. */
  async findExpoIdsWithPhoneNumbers(): Promise<string[]> {
    const rows = await this.drawResults
      .createQueryBuilder('result')
      .innerJoin(SurveyEntity, 'survey', 'survey.id = result.surveyId')
      .select('survey.expoId', 'expoId')
      .where('result.phoneNumber IS NOT NULL')
      .distinct(true)
      .getRawMany<{ expoId: string }>();

    return rows.map((row) => row.expoId);
  }

  /**
   * 박람회의 당첨 결과에서 전화번호만 지운다. 당첨 순번과 발행 기록은 남는다.
   *
   * @returns 번호를 지운 건수
   */
  async clearPhoneNumbers(expoId: string): Promise<number> {
    // 서브쿼리를 문자열로 직접 쓰면 `survey`가 이 엔티티의 관계 속성 이름과 같아 TypeORM이 컬럼명으로 바꿔 버린다.
    // 엔티티로 만든 서브쿼리를 쓰면 테이블 이름이 정확히 나간다.
    const surveyIds = this.drawResults.manager
      .createQueryBuilder()
      .select('survey.id')
      .from(SurveyEntity, 'survey')
      .where('survey.expoId = :expoId')
      .getQuery();

    const result = await this.drawResults
      .createQueryBuilder()
      .update(SurveyDrawResultEntity)
      .set({ phoneNumber: null })
      .where('phone_number IS NOT NULL')
      .andWhere(`survey_id IN (${surveyIds})`)
      .setParameter('expoId', expoId)
      .execute();

    return result.affected ?? 0;
  }
}
