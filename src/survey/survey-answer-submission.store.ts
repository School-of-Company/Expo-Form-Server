import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository, type EntityManager } from 'typeorm';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyEntity } from './entities/survey.entity.js';
import {
  backoffDelayMs,
  chunk,
  type SurveyAnswerRelaySettings,
} from './survey-answer-relay.config.js';

/** 아직 종결되지 않은 상태. 발행·결과 반영은 이 상태의 row만 바꿀 수 있다. */
const IN_FLIGHT_STATUSES = [
  SurveyAnswerSubmissionStatus.RECEIVED,
  SurveyAnswerSubmissionStatus.PUBLISHED,
];

/** {@link SurveyAnswerSubmissionStore.relayPending}에서 발행에 실패한 건. */
export type AnswerRelayFailure = {
  submission: SurveyAnswerSubmissionEntity;
  error: unknown;
};

/** {@link SurveyAnswerSubmissionStore.relayPending}의 발행 콜백이 한 묶음(batch)에 대해 돌려주는 결과. */
export type AnswerRelayBatchResult = {
  published: Array<{
    submission: SurveyAnswerSubmissionEntity;
    version: 1 | 2;
  }>;
  failures: AnswerRelayFailure[];
};

/** {@link SurveyAnswerSubmissionStore.relayPending} 조회 조건. */
export type AnswerRelayOptions = Pick<
  SurveyAnswerRelaySettings,
  | 'staleMs'
  | 'staleMaxMs'
  | 'jitterRatio'
  | 'maxRetryCount'
  | 'sendBatchSize'
> & {
  /** RECEIVED / 재발행 대상 각각의 최대 건수. */
  limit: number;
  /** 재발행 시각 판단 기준. */
  now: Date;
};

/**
 * 설문 답변 접수(아웃박스) 영속성 접근을 한 곳에 모아둔 store.
 * 상태 전이(특히 종결 상태로의 전이)는 전부 조건부 UPDATE로 구현한다 — 이미 종결된 row를
 * 애플리케이션 레벨에서 다시 읽어 판단하면, 그 사이 다른 요청이 끼어드는 경합을 못 막는다.
 *
 * 접수·거절은 설문의 누적 응답 수(`SurveyEntity.totalAnswers`)를 같이 바꾼다. 둘 중 하나만
 * 반영되면 재처리 때 종결 상태 가드에 막혀 보정할 기회가 없으므로, 같은 트랜잭션으로 묶는다.
 */
@Injectable()
export class SurveyAnswerSubmissionStore {
  constructor(
    @InjectRepository(SurveyAnswerSubmissionEntity)
    private readonly submissions: Repository<SurveyAnswerSubmissionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** `(surveyId, phoneNumber)` 조합의 활성(= `REJECTED`가 아닌) 제출 기록이 있는지 확인한다. */
  async findActiveByKey(
    surveyId: string,
    phoneNumber: string,
  ): Promise<SurveyAnswerSubmissionEntity | null> {
    return this.submissions.findOne({
      where: {
        surveyId,
        phoneNumber,
        status: Not(SurveyAnswerSubmissionStatus.REJECTED),
      },
    });
  }

  /** `(surveyId, phoneNumber)` 조합의 가장 최근 제출 기록을 거절 여부와 상관없이 가져온다. */
  async findLatestByKey(
    surveyId: string,
    phoneNumber: string,
  ): Promise<SurveyAnswerSubmissionEntity | null> {
    return this.submissions.findOne({
      where: { surveyId, phoneNumber },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 설문의 누적 응답 수를 늘리고 접수 기록을 저장한다.
   *
   * 동시 요청이 둘 다 {@link findActiveByKey}를 통과하면 활성 제출 유니크 제약이 한쪽을
   * 막는다 — 그 위반은 그대로 던지므로 호출부가 409로 변환해야 한다.
   *
   * 카운트를 먼저 올리는 건 박람회 일괄 삭제(`SurveyStore.deleteByExpoId`)와 순서를 맞추기
   * 위해서다. 이 UPDATE가 설문 row를 잠그므로, 삭제가 먼저면 0행이 갱신돼 기록을 남기지 않고,
   * 이쪽이 먼저면 삭제가 커밋을 기다렸다가 방금 남긴 기록까지 지운다.
   *
   * @returns 기록했으면 true, 그 사이 설문이 지워져 기록하지 않았으면 false
   */
  async createReceived(
    submission: SurveyAnswerSubmissionEntity,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const { affected } = await manager.increment(
        SurveyEntity,
        { id: submission.surveyId },
        'totalAnswers',
        1,
      );
      if ((affected ?? 0) === 0) {
        return false;
      }

      await manager.save(SurveyAnswerSubmissionEntity, submission);
      return true;
    });
  }

  /**
   * 발행할 접수 기록을 잠가서 `publish`로 묶음 단위로 발행하고 표시한다. 대상은 두 가지다.
   * - 한 번도 발행되지 않은(`RECEIVED`) 기록
   * - 결과를 못 받은 채 재발행 시각이 된 `PUBLISHED` 기록. `retryCount`가 `maxRetryCount` 미만인 것만 — 그 이상은
   *   재발행을 포기하고 사람이 봐야 할 대상으로 남겨둔다(무한 재발행으로 부하를 키우지 않기 위해).
   *
   * 재발행 시각은 `publishedAt + 대기`이고, 대기는 `retryCount`에 따라 `staleMs`에서 2배씩 늘어 `staleMaxMs`에서
   * 멈추며(`backoffDelayMs`), 행마다 고정된 지터(`hashtext(id, retryCount)`)를 더한다. 별도 컬럼 없이 기존
   * `retryCount`·`publishedAt`만 쓰므로 마이그레이션이 없다. 지터가 행·회차마다 고정이라 주기마다 다시 뽑히지 않는다.
   *
   * 조회와 발행·표시를 한 트랜잭션에 두고 행을 `FOR UPDATE SKIP LOCKED`로 잡는다. 인스턴스가 여러 대여도 같은
   * 행을 둘이 동시에 읽지 못해 같은 건을 중복 발행하거나 `retryCount`를 두 번 올리지 않는다. 발행하는 동안 DB
   * 연결과 행 잠금을 쥐므로 `limit`을 작게 유지해야 한다. 결과 이벤트를 반영하는 `markFinal`은 같은 행의 잠금이 풀릴
   * 때까지 기다린다.
   *
   * `publish`는 `sendBatchSize` 건 이하의 묶음을 받아 성공한 건(발행한 이벤트 버전과 함께)과 실패한 건을
   * 돌려준다. 실패한 건은 표시하지 않아 다음 주기에 다시 잡힌다.
   *
   * @returns 발행에 실패한 건
   */
  async relayPending(
    options: AnswerRelayOptions,
    publish: (
      batch: SurveyAnswerSubmissionEntity[],
    ) => Promise<AnswerRelayBatchResult>,
  ): Promise<AnswerRelayFailure[]> {
    const { limit, sendBatchSize } = options;
    return this.dataSource.transaction(async (manager) => {
      const received = await manager
        .createQueryBuilder(SurveyAnswerSubmissionEntity, 'submission')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('submission.status = :status', {
          status: SurveyAnswerSubmissionStatus.RECEIVED,
        })
        .orderBy('submission.createdAt', 'ASC')
        .limit(limit)
        .getMany();

      const stalePublished = await this.lockRepublishDue(manager, options);

      const failures: AnswerRelayFailure[] = [];
      for (const batch of chunk([...received, ...stalePublished], sendBatchSize)) {
        // 묶음 단위로 순서대로 발행한다. 한 묶음이 실패해도 다음 묶음은 계속 처리한다.
        // eslint-disable-next-line no-await-in-loop
        const result = await publish(batch);
        failures.push(...result.failures);

        for (const { submission, version } of result.published) {
          // eslint-disable-next-line no-await-in-loop
          await this.markPublished(submission.id, version, manager);
        }
      }

      return failures;
    });
  }

  /** 재발행 시각이 된 `PUBLISHED` 기록을 잠가서 가져온다(`publishedAt` 오름차순). */
  private async lockRepublishDue(
    manager: EntityManager,
    {
      staleMs,
      staleMaxMs,
      jitterRatio,
      maxRetryCount,
      limit,
      now,
    }: AnswerRelayOptions,
  ): Promise<SurveyAnswerSubmissionEntity[]> {
    // 회차(retryCount)마다 기본 대기가 달라 회차별 조건을 OR로 잇는다. 상한(기본 5)이 작아 조건 수도 작다.
    const parameters: Record<string, unknown> = {
      status: SurveyAnswerSubmissionStatus.PUBLISHED,
      now,
      jitterRatio,
    };
    const dueClauses: string[] = [];
    for (let retryCount = 1; retryCount < maxRetryCount; retryCount += 1) {
      parameters[`retry${retryCount}`] = retryCount;
      parameters[`delay${retryCount}`] = backoffDelayMs(retryCount, {
        staleMs,
        staleMaxMs,
      });
      // 원시 SQL 조각이라 SnakeNamingStrategy가 적용되지 않는 부분은 실제 컬럼명을 쓴다.
      dueClauses.push(
        `(submission.retryCount = :retry${retryCount} AND submission.publishedAt + ` +
          `(CAST(:delay${retryCount} AS float8) * (1 + CAST(:jitterRatio AS float8) * ` +
          `((hashtext(CAST(submission.id AS text) || ':' || CAST(submission.retryCount AS text)) & 1023) / 1024.0))` +
          ` ) * INTERVAL '1 millisecond' < :now)`,
      );
    }

    if (dueClauses.length === 0) {
      return [];
    }

    return manager
      .createQueryBuilder(SurveyAnswerSubmissionEntity, 'submission')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .where('submission.status = :status')
      .andWhere(`(${dueClauses.join(' OR ')})`)
      .setParameters(parameters)
      .orderBy('submission.publishedAt', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * 재발행 상한(`maxRetryCount`)까지 다 쓰고도 결과를 받지 못한 `PUBLISHED` 기록을 가져온다.
   * 릴레이는 이 기록을 더 이상 재발행하지 않으므로, 정합성 점검(`SurveyAnswerReconcileService`)이
   * 유저 서비스에 처리 결과를 직접 물어 맞추거나 사람이 볼 수 있게 알린다.
   *
   * 마지막 발행이 `staleBefore`보다 오래된 것만 가져온다 — 방금 마지막으로 발행한 기록은 유저
   * 서비스가 아직 처리 중일 수 있다. 해결되지 않는 기록이 계속 남아도 그 뒤의 기록까지 점검할 수
   * 있도록 `id` 순서의 키셋 페이지(`afterId`)로 끝까지 훑는다.
   */
  async findExhausted({
    maxRetryCount,
    staleBefore,
    limit,
    afterId,
  }: {
    maxRetryCount: number;
    staleBefore: Date;
    limit: number;
    afterId?: string;
  }): Promise<SurveyAnswerSubmissionEntity[]> {
    const query = this.submissions
      .createQueryBuilder('submission')
      .where('submission.status = :status', {
        status: SurveyAnswerSubmissionStatus.PUBLISHED,
      })
      .andWhere('submission.retryCount >= :maxRetryCount', { maxRetryCount })
      .andWhere('submission.publishedAt < :staleBefore', { staleBefore });

    if (afterId !== undefined) {
      query.andWhere('submission.id > :afterId', { afterId });
    }

    return query.orderBy('submission.id', 'ASC').take(limit).getMany();
  }

  /**
   * 발행(또는 재발행) 완료를 기록한다. `eventId`는 건드리지 않는다 — 재발행이어도 최초 발행 때
   * 발급된 값을 그대로 유지해야 유저 서비스가 멱등키로 쓸 수 있다.
   *
   * 아직 종결되지 않은 row만 갱신한다. 발행하는 사이 결과 이벤트가 먼저 도착해 `STORED`/
   * `REJECTED`가 됐다면, 늦게 실행된 이 갱신이 종결 상태를 덮어쓰면 안 된다.
   *
   * 이벤트 버전은 처음 발행할 때 한 번만 기록한다. 이미 기록돼 있으면 그대로 둔다(재발행은 그 버전으로
   * 나갔으므로 같은 값이다).
   */
  async markPublished(
    id: string,
    eventVersion: 1 | 2,
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(SurveyAnswerSubmissionEntity) ?? this.submissions;
    await repository.update(
      { id, status: In(IN_FLIGHT_STATUSES) },
      {
        status: SurveyAnswerSubmissionStatus.PUBLISHED,
        publishedAt: new Date(),
        // 원시 SQL이라 SnakeNamingStrategy가 적용되지 않는다 — 실제 컬럼명을 써야 한다.
        retryCount: () => 'retry_count + 1',
        eventVersion: () => `COALESCE(event_version, ${eventVersion})`,
      },
    );
  }

  /**
   * 결과 이벤트를 반영한다. 아직 종결되지 않은(`RECEIVED`/`PUBLISHED`) row만 갱신한다 —
   * `RECEIVED`도 포함하는 건, 발행 직후 `markPublished()`보다 결과가 먼저 도착할 수 있어서다.
   * 이미 종결된 row는 조건에 안 걸려 무시되므로, 늦게·중복으로 도착한 이벤트가 최종 상태를
   * 덮어쓰지 못한다.
   *
   * `REJECTED`로 바꿨다면 접수 때 미리 늘려둔 누적 응답 수를 같은 트랜잭션에서 되돌린다.
   *
   * @returns 실제로 갱신됐으면 true, 이미 종결 상태라 무시됐으면 false
   */
  async markFinal(
    eventId: string,
    status:
      | SurveyAnswerSubmissionStatus.STORED
      | SurveyAnswerSubmissionStatus.REJECTED,
    rejectReason: string | null,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        SurveyAnswerSubmissionEntity,
        { eventId, status: In(IN_FLIGHT_STATUSES) },
        { status, rejectReason },
      );
      if ((result.affected ?? 0) === 0) {
        return false;
      }

      if (status === SurveyAnswerSubmissionStatus.REJECTED) {
        const { surveyId } = await manager.findOneByOrFail(
          SurveyAnswerSubmissionEntity,
          { eventId },
        );
        await manager.decrement(
          SurveyEntity,
          { id: surveyId },
          'totalAnswers',
          1,
        );
      }

      return true;
    });
  }
}
