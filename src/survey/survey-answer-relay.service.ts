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

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: ConfigService,
    private readonly store: SurveyAnswerSubmissionStore,
  ) {
    this.producer = kafka.producer();
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
              version: 1,
              surveyId: submission.surveyId,
              expoId: submission.expoId,
              participationType: submission.participationType,
              phoneNumber: submission.phoneNumber,
              // 이미 검증이 끝난 값이라 유저 서비스는 해석 없이 그대로 저장만 한다.
              answerJson: JSON.stringify(submission.payload.answers),
              personalInformationStatus:
                submission.payload.personalInformationStatus,
            }),
          },
        ],
      });

      await this.store.markPublished(submission.id);
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
}
