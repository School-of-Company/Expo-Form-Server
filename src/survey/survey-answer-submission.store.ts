import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';

/**
 * 설문 답변 접수(아웃박스) 영속성 접근을 한 곳에 모아둔 store.
 * 상태 전이(특히 종결 상태로의 전이)는 전부 조건부 UPDATE로 구현한다 — 이미 종결된 row를
 * 애플리케이션 레벨에서 다시 읽어 판단하면, 그 사이 다른 요청이 끼어드는 경합을 못 막는다.
 */
@Injectable()
export class SurveyAnswerSubmissionStore {
  constructor(
    @InjectRepository(SurveyAnswerSubmissionEntity)
    private readonly submissions: Repository<SurveyAnswerSubmissionEntity>,
  ) {}

  /** `(surveyId, phoneNumber)` 조합의 활성(= `REJECTED`가 아닌) 제출 기록이 있는지 확인한다. */
  findActiveByKey(
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

  save(
    submission: SurveyAnswerSubmissionEntity,
  ): Promise<SurveyAnswerSubmissionEntity> {
    return this.submissions.save(submission);
  }

  /** eventId로 제출 기록 하나를 조회한다. 없으면 null. */
  findByEventId(eventId: string): Promise<SurveyAnswerSubmissionEntity | null> {
    return this.submissions.findOne({ where: { eventId } });
  }

  /** 한 번도 발행되지 않은(`RECEIVED`) 기록을 오래된 순으로 가져온다. */
  findReceived(limit: number): Promise<SurveyAnswerSubmissionEntity[]> {
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
  findStalePublished(
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
   * 발행(또는 재발행) 완료를 기록한다. `eventId`는 건드리지 않는다 — 재발행이어도 최초 발행 때
   * 발급된 값을 그대로 유지해야 유저 서비스가 멱등키로 쓸 수 있다.
   */
  async markPublished(id: string): Promise<void> {
    await this.submissions
      .createQueryBuilder()
      .update(SurveyAnswerSubmissionEntity)
      .set({
        status: SurveyAnswerSubmissionStatus.PUBLISHED,
        publishedAt: new Date(),
        retryCount: () => '"retryCount" + 1',
      })
      .where('id = :id', { id })
      .execute();
  }

  /**
   * 결과 이벤트를 반영한다. `PUBLISHED` 상태인 row만 갱신한다 — 이미 `STORED`/`REJECTED`로
   * 종결된 row는 조건에 안 걸려 그대로 무시된다. 늦게 도착한 이벤트가 최종 상태를 덮어쓰는 걸
   * 막는 장치다.
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
    const result = await this.submissions
      .createQueryBuilder()
      .update(SurveyAnswerSubmissionEntity)
      .set({ status, rejectReason })
      .where('eventId = :eventId', { eventId })
      .andWhere('status = :publishedStatus', {
        publishedStatus: SurveyAnswerSubmissionStatus.PUBLISHED,
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }
}
