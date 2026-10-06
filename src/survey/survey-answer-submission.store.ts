import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyEntity } from './entities/survey.entity.js';

/** 아직 종결되지 않은 상태. 발행·결과 반영은 이 상태의 row만 바꿀 수 있다. */
const IN_FLIGHT_STATUSES = [
  SurveyAnswerSubmissionStatus.RECEIVED,
  SurveyAnswerSubmissionStatus.PUBLISHED,
];

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

  /**
   * 접수 기록을 저장하고 설문의 누적 응답 수를 늘린다.
   *
   * 동시 요청이 둘 다 {@link findActiveByKey}를 통과하면 활성 제출 유니크 제약이 한쪽을
   * 막는다 — 그 위반은 그대로 던지므로 호출부가 409로 변환해야 한다.
   */
  async createReceived(
    submission: SurveyAnswerSubmissionEntity,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.save(SurveyAnswerSubmissionEntity, submission);
      await manager.increment(
        SurveyEntity,
        { id: submission.surveyId },
        'totalAnswers',
        1,
      );
    });
  }

  /** 한 번도 발행되지 않은(`RECEIVED`) 기록을 오래된 순으로 가져온다. */
  async findReceived(limit: number): Promise<SurveyAnswerSubmissionEntity[]> {
    return this.submissions.find({
      where: { status: SurveyAnswerSubmissionStatus.RECEIVED },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * `publishedAt`이 `staleBefore`보다 오래된, 즉 결과를 못 받은 채 방치된 `PUBLISHED` 기록을
   * 가져온다. `retryCount`가 `maxRetryCount` 미만인 것만 — 그 이상은 재발행을 포기하고 사람이
   * 봐야 할 대상으로 남겨둔다(무한 재발행으로 부하를 키우지 않기 위해).
   */
  async findStalePublished(
    staleBefore: Date,
    maxRetryCount: number,
    limit: number,
  ): Promise<SurveyAnswerSubmissionEntity[]> {
    return this.submissions
      .createQueryBuilder('submission')
      .where('submission.status = :status', {
        status: SurveyAnswerSubmissionStatus.PUBLISHED,
      })
      .andWhere('submission.publishedAt < :staleBefore', { staleBefore })
      .andWhere('submission.retryCount < :maxRetryCount', { maxRetryCount })
      .orderBy('submission.publishedAt', 'ASC')
      .take(limit)
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
   */
  async markPublished(id: string): Promise<void> {
    await this.submissions.update(
      { id, status: In(IN_FLIGHT_STATUSES) },
      {
        status: SurveyAnswerSubmissionStatus.PUBLISHED,
        publishedAt: new Date(),
        // 원시 SQL이라 SnakeNamingStrategy가 적용되지 않는다 — 실제 컬럼명을 써야 한다.
        retryCount: () => 'retry_count + 1',
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
