import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, type KafkaMessage } from 'kafkajs';
import { KAFKA_CLIENT } from '../kafka/kafka.constants.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

interface SurveyAnswerResultEvent {
  eventId: string;
  status: 'STORED' | 'REJECTED';
  reason?: string;
}

/**
 * 유저 서비스가 설문 답변을 처리한 결과(`STORED`/`REJECTED`)를 받아 접수 기록 상태를 갱신한다.
 *
 * 실제 상태 갱신은 {@link SurveyAnswerSubmissionStore.markFinal}이 종결되지 않은 row만
 * 조건부로 갱신하고, `REJECTED`면 누적 응답 수 보정까지 같은 트랜잭션에서 처리한다 —
 * 늦게·중복으로 도착한 이벤트는 자동으로 무시되므로, 이 클래스는 결과를 넘기기만 한다.
 */
@Injectable()
export class SurveyAnswerResultConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SurveyAnswerResultConsumer.name);
  private readonly consumer: Consumer;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: ConfigService,
    private readonly submissionStore: SurveyAnswerSubmissionStore,
  ) {
    this.consumer = kafka.consumer({
      groupId: config.get<string>(
        'KAFKA_SURVEY_ANSWER_RESULT_GROUP_ID',
        'expo-form-server.survey-answer-result',
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.config.getOrThrow<string>('KAFKA_SURVEY_ANSWER_RESULT_TOPIC'),
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => this.handle(message),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle(message: KafkaMessage): Promise<void> {
    if (!message.value) {
      return;
    }

    const event = JSON.parse(
      message.value.toString(),
    ) as SurveyAnswerResultEvent;

    if (event.status !== 'STORED' && event.status !== 'REJECTED') {
      this.logger.warn(
        `알 수 없는 결과 상태 무시: eventId=${event.eventId}, status=${String(event.status)}`,
      );
      return;
    }

    const applied = await this.submissionStore.markFinal(
      event.eventId,
      SurveyAnswerSubmissionStatus[event.status],
      event.status === 'REJECTED' ? (event.reason ?? null) : null,
    );
    if (!applied) {
      this.logger.log(`이미 종결된 접수라 결과 무시: eventId=${event.eventId}`);
    }
  }
}
