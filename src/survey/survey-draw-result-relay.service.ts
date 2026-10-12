import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DicoshotService } from 'dicoshot-nest';
import { Kafka, Producer } from 'kafkajs';
import { KAFKA_CLIENT } from '../kafka/kafka.constants.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyDrawResultStore } from './survey-draw-result.store.js';

/** 한 번에 처리할 최대 건수. 배치가 무한정 커지지 않게 상한을 둔다. */
const BATCH_SIZE = 100;

/**
 * 발행 실패를 몇 번까지 다시 시도할지의 기본값(`SURVEY_DRAW_RESULT_MAX_RETRY_COUNT`). 10초 주기라 100번이면 약 17분이다 —
 * Kafka가 잠깐 끊겼다고 당첨 문자를 포기하지 않을 만큼 길고, 계속 실패하는 건이 영원히 배치를 차지하지 않을 만큼 짧다.
 */
const DEFAULT_MAX_RETRY_COUNT = 100;

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
  private running = false;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: ConfigService,
    private readonly store: SurveyDrawResultStore,
    private readonly dicoshot: DicoshotService,
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
    // 같은 인스턴스에서 이전 실행이 아직 돌고 있으면(Kafka가 느릴 때) 겹쳐 돌지 않는다. 다른 인스턴스와의
    // 중복은 store가 행 잠금(`SKIP LOCKED`)으로 막는다.
    if (this.running) {
      this.logger.warn('이전 당첨 결과 발행이 끝나지 않아 건너뜁니다.');
      return;
    }

    this.running = true;
    try {
      const maxRetryCount = this.config.get<number>(
        'SURVEY_DRAW_RESULT_MAX_RETRY_COUNT',
        DEFAULT_MAX_RETRY_COUNT,
      );
      const failures = await this.store.relayUnpublished(
        BATCH_SIZE,
        maxRetryCount,
        async (result) => this.publishOne(result),
      );

      for (const { result, error, retryCount } of failures) {
        // 발행 실패는 실패 횟수만 올라가 다음 주기에 다시 시도된다. 전화번호는 개인정보라 로그에 담지 않는다.
        this.logger.error(
          `경품 당첨 결과 발행 실패: drawResultId=${result.id} (${retryCount}/${maxRetryCount})`,
          error,
        );
        if (retryCount >= maxRetryCount) {
          // eslint-disable-next-line no-await-in-loop
          await this.alertExhausted(result, maxRetryCount);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** 상한까지 실패해 더는 자동으로 보내지 않는 건을 사람이 볼 수 있게 알린다. 알림 실패가 릴레이를 멈추지 않게 한다. */
  private async alertExhausted(
    result: SurveyDrawResultEntity,
    maxRetryCount: number,
  ): Promise<void> {
    try {
      await this.dicoshot.sendCustom({
        title: '경품 당첨 문자 발행 포기',
        description: `당첨 결과 발행이 ${maxRetryCount}회 연속 실패해 더 이상 자동으로 보내지 않습니다. 원인을 해결한 뒤 \`retry_count\`를 0으로 되돌리면 다시 발행됩니다.`,
        color: 'warning',
        fields: [
          { name: 'drawResultId', value: result.id },
          { name: 'surveyId', value: result.surveyId },
          { name: 'drawNumber', value: String(result.drawNumber) },
        ],
      });
    } catch (error) {
      this.logger.error('당첨 결과 발행 포기 알림 전송 실패', error);
    }
  }

  /** 한 건을 발행한다. 실패는 호출한 store가 실패 횟수로 기록하므로 여기서 삼키지 않는다. */
  private async publishOne(result: SurveyDrawResultEntity): Promise<void> {
    const topic = this.config.get<string>(
      'KAFKA_SMS_REQUESTED_TOPIC',
      'notification.sms.requested',
    );

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
  }
}
