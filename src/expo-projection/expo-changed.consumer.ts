import { setTimeout as sleep } from 'node:timers/promises';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, Producer, type KafkaMessage } from 'kafkajs';
import { KAFKA_CLIENT } from '../kafka/kafka.constants.js';
import { parseExpoChangedEvent } from './expo-changed-event.js';
import {
  DEFAULT_EXPO_CHANGED_GROUP_ID,
  DEFAULT_EXPO_CHANGED_TOPIC,
  deadLetterTopicOf,
  EXPO_CHANGED_GROUP_ID_KEY,
  EXPO_CHANGED_TOPIC_KEY,
} from './expo-projection.config.js';
import { ExpoProjectionStore } from './expo-projection.store.js';

/** 반영 실패 시 같은 메시지를 다시 시도하는 횟수(첫 시도 포함)와 첫 대기 시간. 대기는 두 배씩 늘어난다. */
export const APPLY_MAX_ATTEMPTS = 3;
export const APPLY_RETRY_BASE_DELAY_MS = 200;

type Origin = { topic: string; partition: number; offset: string };

/**
 * 박람회 서비스가 보내는 `expo.expo.changed`를 받아 박람회 프로젝션을 갱신한다.
 *
 * 중복·순서 뒤바뀜은 {@link ExpoProjectionStore.apply}가 박람회별 마지막 버전으로 거른다. 해석할 수 없는
 * 메시지는 바로, 반영이 {@link APPLY_MAX_ATTEMPTS}번 실패한 메시지는 `<topic>.dlt`로 보내고 넘어간다 —
 * 메시지마다 박람회 전체 상태가 실리므로 다음 변경이나 재발행(republish)이 프로젝션을 다시 맞춘다. DLT
 * 전송까지 실패하면 던져서 오프셋을 커밋하지 않는다.
 *
 * `KAFKA_EXPO_PROJECTION_ENABLED=true`일 때만 이 컨슈머를 담은 모듈이 뜬다(`AppModule`).
 */
@Injectable()
export class ExpoChangedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpoChangedConsumer.name);
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly topic: string;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    config: ConfigService,
    private readonly store: ExpoProjectionStore,
  ) {
    this.topic = config.get<string>(
      EXPO_CHANGED_TOPIC_KEY,
      DEFAULT_EXPO_CHANGED_TOPIC,
    );
    this.consumer = kafka.consumer({
      groupId: config.get<string>(
        EXPO_CHANGED_GROUP_ID_KEY,
        DEFAULT_EXPO_CHANGED_GROUP_ID,
      ),
    });
    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
    // 처음 뜰 때 토픽에 남아 있는 상태부터 받는다. 프로젝션을 새로 채우려면 박람회 서비스에 republish를 부른다.
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) =>
        this.handle(message, { topic, partition, offset: message.offset }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }

  private async handle(message: KafkaMessage, origin: Origin): Promise<void> {
    // 박람회 서비스는 tombstone도 JSON으로 보낸다. 값이 없는 메시지는 이 계약 밖이다.
    const event =
      message.value === null
        ? undefined
        : parseExpoChangedEvent(message.value.toString());
    if (event === undefined) {
      await this.deadLetter(message, origin, '해석할 수 없는 메시지');
      return;
    }

    for (let attempt = 1; ; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop -- 재시도는 순서대로 한 번씩 해야 한다
        const result = await this.store.apply(event);
        if (result === 'stale') {
          this.logger.debug(
            `이미 반영한 버전이라 무시: expoId=${event.expoId}, version=${event.version}, eventId=${event.eventId}`,
          );
        }

        return;
      } catch (error) {
        if (attempt >= APPLY_MAX_ATTEMPTS) {
          this.logger.error(
            `박람회 프로젝션 반영 실패(${attempt}회): expoId=${event.expoId}, version=${event.version}`,
            error,
          );
          // eslint-disable-next-line no-await-in-loop -- 마지막 시도 뒤 한 번만 보낸다
          await this.deadLetter(
            message,
            origin,
            error instanceof Error ? error.message : String(error),
          );
          return;
        }

        // eslint-disable-next-line no-await-in-loop -- 재시도 사이의 대기다
        await sleep(APPLY_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)));
      }
    }
  }

  /** 원래 키·값을 그대로 싣고, 어디서 왜 실패했는지를 헤더로 남긴다(Spring `DeadLetterPublishingRecoverer`와 같은 이름). */
  private async deadLetter(
    message: KafkaMessage,
    origin: Origin,
    reason: string,
  ): Promise<void> {
    const where = `${origin.topic}[${origin.partition}]@${origin.offset}`;
    this.logger.error(
      `박람회 변경 이벤트를 DLT로 보냅니다: ${where} — ${reason}`,
    );
    await this.producer.send({
      topic: deadLetterTopicOf(origin.topic),
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            'kafka_dlt-original-topic': origin.topic,
            'kafka_dlt-original-partition': String(origin.partition),
            'kafka_dlt-original-offset': origin.offset,
            'kafka_dlt-exception-message': reason,
          },
        },
      ],
    });
  }
}
