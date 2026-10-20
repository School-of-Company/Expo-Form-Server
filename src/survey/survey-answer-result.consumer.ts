import { Buffer } from 'node:buffer';
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
      eachMessage: async ({ topic, partition, message }) =>
        this.handle(message, `${topic}[${partition}]@${message.offset}`),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle(message: KafkaMessage, origin: string): Promise<void> {
    if (!message.value) {
      return;
    }

    // 깨진 메시지가 밖으로 던져지면 kafkajs가 재시도 불가 오류로 보고 이 컨슈머를 멈춘다. 재시도해도
    // 결과가 같으므로 위치만 남기고 건너뛴다. 본문은 전화번호 등이 섞일 수 있어 남기지 않는다.
    const event = this.parse(message.value);
    if (event === undefined) {
      this.logger.error(`결과 이벤트를 해석할 수 없어 건너뜁니다: ${origin}`);
      return;
    }

    if (event.status !== 'STORED' && event.status !== 'REJECTED') {
      this.logger.warn(
        `알 수 없는 결과 상태 무시: eventId=${event.eventId}, status=${String(event.status)}`,
      );
      return;
    }

    // 여기서부터의 오류(DB 장애 등)는 일시적일 수 있으므로 삼키지 않고 던져 재시도되게 둔다.
    const applied = await this.submissionStore.markFinal(
      event.eventId,
      SurveyAnswerSubmissionStatus[event.status],
      event.status === 'REJECTED' && typeof event.reason === 'string'
        ? event.reason
        : null,
    );
    if (!applied) {
      this.logger.log(`이미 종결된 접수라 결과 무시: eventId=${event.eventId}`);
    }
  }

  /** JSON 객체이고 `eventId`가 비어 있지 않은 문자열이면 이벤트를, 아니면 `undefined`를 돌려준다. */
  private parse(value: Buffer): SurveyAnswerResultEvent | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value.toString());
    } catch {
      return undefined;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }

    const { eventId } = parsed as { eventId?: unknown };
    return typeof eventId !== 'string' || eventId === '' ? undefined : (parsed as SurveyAnswerResultEvent);
  }
}
