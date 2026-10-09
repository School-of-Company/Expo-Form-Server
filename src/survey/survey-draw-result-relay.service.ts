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
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyDrawResultStore } from './survey-draw-result.store.js';

/** 한 번에 처리할 최대 건수. 배치가 무한정 커지지 않게 상한을 둔다. */
const BATCH_SIZE = 100;

/**
 * 경품 당첨 결과(아웃박스)를 알림 서비스로 발행하는 릴레이.
 *
 * 당첨 판정이 DB에 결과만 남기고 끝나므로, 실제 발행은 이 릴레이가 주기적으로 돌면서 담당한다. 발행에
 * 실패하거나 발행 직후 표시 전에 멈춰도 다음 주기에 다시 보내는데, `eventId`가 그대로라 알림 서비스가 같은
 * 당첨 문자를 두 번 보내지 않는다.
 */
@Injectable()
export class SurveyDrawResultRelayService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SurveyDrawResultRelayService.name);
  private readonly producer: Producer;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: ConfigService,
    private readonly store: SurveyDrawResultStore,
  ) {
    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async relay(): Promise<void> {
    const results = await this.store.findUnpublished(BATCH_SIZE);

    for (const result of results) {
      // 한 건씩 순서대로 발행한다. 실패해도 다음 건을 계속 처리하고, Kafka에 한꺼번에 몰아넣지 않는다.
      // eslint-disable-next-line no-await-in-loop
      await this.publishOne(result);
    }
  }

  private async publishOne(result: SurveyDrawResultEntity): Promise<void> {
    const topic = this.config.get<string>(
      'KAFKA_SMS_REQUESTED_TOPIC',
      'notification.sms.requested',
    );

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: result.surveyId,
            value: JSON.stringify({
              type: 'DRAW_RESULT',
              eventId: result.eventId,
              version: 1,
              phoneNumber: result.phoneNumber,
              drawNumber: result.drawNumber,
            }),
          },
        ],
      });

      await this.store.markPublished(result.id);
    } catch (error) {
      // 발행 실패는 publishedAt이 비어 있어 다음 주기에 그대로 재시도된다 — 여기서 던지면 같은 배치의 나머지
      // 처리가 멈추니 로그만 남기고 다음 건으로 넘어간다. 전화번호는 개인정보라 로그에 담지 않는다.
      this.logger.error(
        `경품 당첨 결과 발행 실패: drawResultId=${result.id}`,
        error,
      );
    }
  }
}
