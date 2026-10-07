import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Kafka, Producer } from 'kafkajs';
import { KAFKA_CLIENT } from '../kafka/kafka.constants.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

/** 한 번에 처리할 최대 건수. 배치가 무한정 커지지 않게 상한을 둔다. */
const BATCH_SIZE = 100;

/**
 * 설문 답변 접수(아웃박스) 레코드를 Kafka로 발행하는 릴레이.
 *
 * `submit()`이 DB에 저장만 하고 끝나므로, 실제 발행은 이 릴레이가 주기적으로 돌면서 담당한다.
 * `RECEIVED`(한 번도 발행 안 된 것)와, 결과를 못 받은 채 일정 시간 지난 `PUBLISHED`(재발행 대상)
 * 를 같이 훑는다. 재발행이어도 `eventId`는 그대로 유지한다 — 유저 서비스가 멱등키로 쓸 수 있어야
 * 하기 때문이다(#29 cfcromn 리뷰 참고).
 */
@Injectable()
export class SurveyAnswerRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SurveyAnswerRelayService.name);
  private readonly producer: Producer;
  private readonly eventVersion: 1 | 2;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: ConfigService,
    private readonly store: SurveyAnswerSubmissionStore,
  ) {
    this.producer = kafka.producer();

    // 유저 서비스가 v2를 받기 전에 v2를 발행하면 이벤트가 거부되므로, 어느 버전을 보낼지 배포 때 고른다.
    const version = Number(config.get('SURVEY_ANSWER_EVENT_VERSION', 1));
    if (version !== 1 && version !== 2) {
      throw new Error('SURVEY_ANSWER_EVENT_VERSION must be 1 or 2.');
    }

    this.eventVersion = version;
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async relay(): Promise<void> {
    const staleAfterMs = this.config.get<number>(
      'SURVEY_ANSWER_STALE_MS',
      5 * 60 * 1000,
    );
    const maxRetryCount = this.config.get<number>(
      'SURVEY_ANSWER_MAX_RETRY_COUNT',
      5,
    );

    const [received, stalePublished] = await Promise.all([
      this.store.findReceived(BATCH_SIZE),
      this.store.findStalePublished(
        new Date(Date.now() - staleAfterMs),
        maxRetryCount,
        BATCH_SIZE,
      ),
    ]);

    for (const submission of [...received, ...stalePublished]) {
      // 한 건씩 순서대로 발행한다. 실패해도 다음 건을 계속 처리하고, Kafka에 한꺼번에 몰아넣지 않는다.
      // eslint-disable-next-line no-await-in-loop
      await this.publishOne(submission);
    }
  }

  private async publishOne(
    submission: SurveyAnswerSubmissionEntity,
  ): Promise<void> {
    const topic = this.config.getOrThrow<string>(
      'KAFKA_SURVEY_ANSWER_SUBMIT_TOPIC',
    );

    const version = this.versionFor(submission);
    const { questions } = submission.payload;

    try {
      await this.producer.send({
        topic,
        // surveyId + 전화번호로 파티션을 묶어, 같은 응답자의 이벤트가 파티션 내에서는
        // 순서가 뒤집히지 않게 한다.
        messages: [
          {
            key: `${submission.surveyId}:${submission.phoneNumber}`,
            value: JSON.stringify({
              eventId: submission.eventId,
              version,
              surveyId: submission.surveyId,
              expoId: submission.expoId,
              participationType: submission.participationType,
              phoneNumber: submission.phoneNumber,
              // 이미 검증이 끝난 값이라 유저 서비스는 해석 없이 그대로 저장만 한다.
              answerJson: JSON.stringify(submission.payload.answers),
              personalInformationStatus:
                submission.payload.personalInformationStatus,
              ...(version === 2 && { questions }),
            }),
          },
        ],
      });

      await this.store.markPublished(submission.id, version);
    } catch (error) {
      // 발행 실패는 다음 주기에 그대로 재시도된다(RECEIVED는 publishedAt이 없어 계속
      // findReceived에 잡히고, PUBLISHED로 안 바뀌었으니 재시도 대상에서 빠지지 않는다) —
      // 여기서 던지면 같은 배치의 나머지 건 처리가 멈추니 로그만 남기고 다음 건으로 넘어간다.
      this.logger.error(
        `설문 답변 발행 실패: submissionId=${submission.id}`,
        error,
      );
    }
  }

  /**
   * 이 접수 건을 어떤 버전으로 발행할지 정한다.
   *
   * 이미 발행한 적 있으면 그때의 버전을 그대로 쓴다. 같은 `eventId`가 다른 내용으로 나가면 유저 서비스가
   * 처음 처리한 이벤트만 반영하고 나머지는 중복으로 무시해서, 설정을 올린 뒤 재발행해도 스냅샷이 전달되지
   * 않는다. 처음 발행하는 건은 설정을 따르되, 스냅샷이 없으면 v2를 만들 수 없어 v1이다.
   */
  private versionFor(submission: SurveyAnswerSubmissionEntity): 1 | 2 {
    const { eventVersion, status, payload } = submission;
    if (eventVersion === 1 || eventVersion === 2) {
      return eventVersion;
    }

    // 버전을 기록하기 전에 이미 발행된 건은 v1만 있던 때 나간 것이다.
    if (status === SurveyAnswerSubmissionStatus.PUBLISHED) {
      return 1;
    }

    return payload.questions !== undefined && this.eventVersion === 2 ? 2 : 1;
  }
}
