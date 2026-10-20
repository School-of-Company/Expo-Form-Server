import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Kafka, Producer } from 'kafkajs';
import { KAFKA_CLIENT } from '../kafka/kafka.constants.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import {
  type AnswerRelayBatchResult,
  SurveyAnswerSubmissionStore,
} from './survey-answer-submission.store.js';
import {
  resolveRelaySettings,
  type SurveyAnswerRelaySettings,
} from './survey-answer-relay.config.js';

const RELAY_INTERVAL_NAME = 'survey-answer-relay';

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
  private readonly settings: SurveyAnswerRelaySettings;
  private running = false;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: ConfigService,
    private readonly store: SurveyAnswerSubmissionStore,
    private readonly scheduler: SchedulerRegistry,
  ) {
    this.producer = kafka.producer();
    this.settings = resolveRelaySettings((key) => config.get(key));

    // 유저 서비스가 v2를 받기 전에 v2를 발행하면 이벤트가 거부되므로, 어느 버전을 보낼지 배포 때 고른다.
    const version = Number(config.get('SURVEY_ANSWER_EVENT_VERSION', 1));
    if (version !== 1 && version !== 2) {
      throw new Error('SURVEY_ANSWER_EVENT_VERSION must be 1 or 2.');
    }

    this.eventVersion = version;
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();

    // 주기를 환경변수로 바꿀 수 있어야 해서 `@Cron`(고정 표현식) 대신 기동 때 간격을 등록한다.
    const handle = setInterval(() => {
      void this.relay();
    }, this.settings.intervalMs);
    this.scheduler.addInterval(RELAY_INTERVAL_NAME, handle);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.scheduler.doesExist('interval', RELAY_INTERVAL_NAME)) {
      this.scheduler.deleteInterval(RELAY_INTERVAL_NAME);
    }

    await this.producer.disconnect();
  }

  async relay(): Promise<void> {
    // 같은 인스턴스에서 이전 실행이 아직 돌고 있으면(Kafka가 느릴 때) 겹쳐 돌지 않는다. 다른 인스턴스와의
    // 중복은 store가 행 잠금(`SKIP LOCKED`)으로 막는다.
    if (this.running) {
      this.logger.warn('이전 설문 답변 발행이 끝나지 않아 건너뜁니다.');
      return;
    }

    this.running = true;
    try {
      const failures = await this.store.relayPending(
        { ...this.settings, limit: this.settings.batchSize, now: new Date() },
        async (batch) => this.publishBatch(batch),
      );

      for (const { submission, error } of failures) {
        // 발행 실패는 표시하지 않아 다음 주기에 그대로 다시 잡힌다(RECEIVED는 계속 RECEIVED, PUBLISHED는
        // 재시도 대상에서 빠지지 않는다). 전화번호가 실려 있는 요청 내용은 남기지 않는다.
        this.logger.error(
          `설문 답변 발행 실패: submissionId=${submission.id}`,
          error,
        );
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * 한 묶음을 `sendBatch`로 한 번에 발행한다. 묶음이 실패하면 전체를 실패로 돌려 다음 주기에 다시 잡히게 한다
   * (일부 파티션만 들어갔어도 재발행은 같은 `eventId`라 유저 서비스가 중복으로 무시한다).
   * 다만 재시도해도 소용없는 오류(`retriable === false`, 예: 메시지 하나가 너무 큼)이고 묶음이 둘 이상이면
   * 한 건씩 나눠 보내, 문제 있는 한 건 때문에 같은 묶음의 정상 건이 계속 막히지 않게 한다.
   */
  private async publishBatch(
    batch: SurveyAnswerSubmissionEntity[],
  ): Promise<AnswerRelayBatchResult> {
    const topic = this.config.getOrThrow<string>(
      'KAFKA_SURVEY_ANSWER_SUBMIT_TOPIC',
    );
    const prepared = batch.map((submission) => ({
      submission,
      ...this.toMessage(submission),
    }));

    try {
      await this.producer.sendBatch({
        topicMessages: [
          { topic, messages: prepared.map(({ message }) => message) },
        ],
      });
    } catch (error) {
      const {retriable} = (error as { retriable?: boolean });
      if (retriable !== false || batch.length === 1) {
        return {
          published: [],
          failures: batch.map((submission) => ({ submission, error })),
        };
      }

      return this.publishOneByOne(topic, prepared);
    }

    return {
      published: prepared.map(({ submission, version }) => ({
        submission,
        version,
      })),
      failures: [],
    };
  }

  private async publishOneByOne(
    topic: string,
    prepared: Array<{
      submission: SurveyAnswerSubmissionEntity;
      version: 1 | 2;
      message: { key: string; value: string };
    }>,
  ): Promise<AnswerRelayBatchResult> {
    const result: AnswerRelayBatchResult = { published: [], failures: [] };
    for (const { submission, version, message } of prepared) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.producer.send({ topic, messages: [message] });
        result.published.push({ submission, version });
      } catch (error) {
        result.failures.push({ submission, error });
      }
    }

    return result;
  }

  private toMessage(submission: SurveyAnswerSubmissionEntity): {
    version: 1 | 2;
    message: { key: string; value: string };
  } {
    const version = this.versionFor(submission);
    const { questions } = submission.payload;

    return {
      version,
      message: {
        // surveyId + 전화번호로 파티션을 묶어, 같은 응답자의 이벤트가 파티션 내에서는
        // 순서가 뒤집히지 않게 한다.
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
    };
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
