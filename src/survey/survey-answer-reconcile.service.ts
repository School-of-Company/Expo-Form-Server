import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DicoshotService } from 'dicoshot-nest';
import {
  USER_CLIENT,
  type SurveyAnswerEventResult,
  type UserClient,
} from '../user-client/user-client.interface.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

/** 한 번에 DB에서 가져올 기록 수. */
const PAGE_SIZE = 100;

/** 점검 한 번에 유저 서비스에 물어볼 최대 건수. 넘으면 다음 점검으로 넘기고 알린다. */
const MAX_CHECKS_PER_RUN = 1000;

/** 알림 한 번에 실을 eventId 수. 나머지는 개수로만 알린다. */
const ALERT_EVENT_ID_LIMIT = 10;

/** 점검 한 번의 결과. */
export type ReconcileSummary = {
  /** 유저 서비스에 물어본 기록 수. */
  checked: number;
  /** 유저 서비스의 처리 결과를 받아 `STORED`/`REJECTED`로 맞춘 수. */
  applied: number;
  /** 유저 서비스가 처리한 적 없다고 답한 기록 — 사람이 재발행 여부를 판단해야 한다. */
  unprocessedEventIds: string[];
  /** 유저 서비스가 응답하지 않아 점검을 중단했는지. 남은 기록은 다음 점검에서 다시 본다. */
  interrupted: boolean;
  /** 한 번에 점검하는 상한에 걸려 남은 기록이 있을 수 있는지. */
  truncated: boolean;
  /** 이전 점검이 아직 끝나지 않아 이번 점검을 건너뛰었는지. */
  skipped: boolean;
  /** 점검이 꺼져 있어(`SURVEY_ANSWER_RECONCILE_ENABLED`) 아무것도 하지 않았는지. */
  disabled: boolean;
};

const emptySummary = (): ReconcileSummary => ({
  checked: 0,
  applied: 0,
  unprocessedEventIds: [],
  interrupted: false,
  truncated: false,
  skipped: false,
  disabled: false,
});

/**
 * 설문 답변 접수(아웃박스)의 정합성 점검.
 *
 * 릴레이는 결과를 못 받은 `PUBLISHED` 기록을 재발행 상한까지만 다시 보내고 그 뒤로는 손을 뗀다.
 * 그런 기록은 `totalAnswers`만 늘어 있고 유저 서비스에 저장됐는지 알 수 없는 채로 남는다. 이
 * 서비스가 주기적으로 그런 기록을 찾아 유저 서비스에 처리 결과를 직접 묻는다.
 *
 * - 처리 결과가 있으면(결과 이벤트만 유실된 경우) 결과 컨슈머와 같은 경로(`markFinal`)로 반영한다.
 *   `REJECTED`면 누적 응답 수도 같은 트랜잭션에서 되돌아간다.
 * - 처리한 적 없다는 기록은 상태를 건드리지 않고 Discord로 알린다. 다시 보낼지는 사람이
 *   판단한다(README의 복구 절차).
 * - 유저 서비스가 응답하지 않으면 그 자리에서 점검을 멈춘다. 장애 중에 건마다 타임아웃을 기다리면
 *   점검 하나가 다음 주기를 넘길 수 있다.
 * - 한 번에 점검하는 상한에 걸리거나 장애로 멈추면, 다음 점검은 마지막으로 확인한 기록 다음부터
 *   이어서 본다. 끝까지 훑으면 다음 점검은 처음부터 다시 본다. 이 위치는 인스턴스 메모리에만 있어서
 *   재시작하면 처음부터이고, 인스턴스가 여러 개면 각자 따로 기억한다.
 * - 알림이 필요한 결과는 Discord와 별개로 항상 오류 로그로도 남긴다. 웹훅이 설정되지 않으면 Dicoshot은
 *   보내지 않고도 성공으로 돌아오기 때문이다.
 *
 * 유저 서비스의 처리 결과 조회 API(Expo-User-Server#11)가 배포되기 전에는 아직 없는 경로의 404가
 * "처리한 적 없음"으로 읽혀 거짓 알림이 나간다. 그래서 `SURVEY_ANSWER_RECONCILE_ENABLED=true`일 때만
 * 동작한다.
 */
@Injectable()
export class SurveyAnswerReconcileService {
  private readonly logger = new Logger(SurveyAnswerReconcileService.name);
  private running = false;
  /** 다음 점검을 시작할 위치(이 id 다음부터). 끝까지 훑었으면 undefined라 처음부터 본다. */
  private resumeAfterId: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly store: SurveyAnswerSubmissionStore,
    @Inject(USER_CLIENT) private readonly userClient: UserClient,
    private readonly dicoshot: DicoshotService,
  ) {}

  /** 재발행 상한(기본 5회 × 5분)을 다 쓴 기록이 대상이라 매시간이면 충분하다. */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcile(): Promise<ReconcileSummary> {
    if (this.config.get<string>('SURVEY_ANSWER_RECONCILE_ENABLED') !== 'true') {
      this.logger.debug(
        '정합성 점검이 꺼져 있습니다(SURVEY_ANSWER_RECONCILE_ENABLED).',
      );
      return { ...emptySummary(), disabled: true };
    }

    // 같은 인스턴스에서 이전 점검이 아직 돌고 있으면 겹쳐 돌지 않는다.
    if (this.running) {
      this.logger.warn(
        '이전 정합성 점검이 끝나지 않아 이번 점검을 건너뜁니다.',
      );
      return { ...emptySummary(), skipped: true };
    }

    this.running = true;
    try {
      const summary = await this.check();
      this.report(summary);
      if (
        summary.unprocessedEventIds.length > 0 ||
        summary.interrupted ||
        summary.truncated
      ) {
        this.logAlert(summary);
        await this.alert(summary);
      }

      return summary;
    } finally {
      this.running = false;
    }
  }

  private async check(): Promise<ReconcileSummary> {
    const summary = emptySummary();
    const maxRetryCount = this.readNumber('SURVEY_ANSWER_MAX_RETRY_COUNT', 5);
    const staleBefore = new Date(
      Date.now() - this.readNumber('SURVEY_ANSWER_STALE_MS', 5 * 60 * 1000),
    );
    let afterId = this.resumeAfterId;
    /** 이번 점검에서 결과까지 확인한 마지막 기록. 멈추면 다음 점검이 여기 다음부터 이어 본다. */
    let lastCheckedId: string | undefined;

    while (summary.checked < MAX_CHECKS_PER_RUN) {
      const limit = Math.min(PAGE_SIZE, MAX_CHECKS_PER_RUN - summary.checked);
      // 페이지는 앞 페이지의 마지막 id부터 이어지므로 순서대로 가져와야 한다.
      // eslint-disable-next-line no-await-in-loop
      const page = await this.store.findExhausted({
        maxRetryCount,
        staleBefore,
        limit,
        afterId,
      });

      for (const { id, eventId } of page) {
        // 유저 서비스에 한꺼번에 몰리지 않도록 한 건씩 묻고, 장애면 바로 멈춘다.
        // eslint-disable-next-line no-await-in-loop
        const result = await this.findResult(eventId);
        if (result === 'unavailable') {
          summary.interrupted = true;
          // 이번에 하나도 못 봤으면 원래 위치를 그대로 둔다.
          this.resumeAfterId = lastCheckedId ?? this.resumeAfterId;
          return summary;
        }

        lastCheckedId = id;

        summary.checked++;
        if (result === null) {
          summary.unprocessedEventIds.push(eventId);
        } else {
          // eslint-disable-next-line no-await-in-loop
          const applied = await this.apply(eventId, result);
          if (applied) {
            summary.applied++;
          }
        }
      }

      if (page.length < limit) {
        // 끝까지 훑었다. 다음 점검은 처음부터 다시 본다.
        this.resumeAfterId = undefined;
        return summary;
      }

      afterId = page.at(-1)?.id;
    }

    summary.truncated = true;
    this.resumeAfterId = lastCheckedId;
    return summary;
  }

  /** 결과 이벤트를 받았을 때와 같은 값으로 반영한다. 거절 사유는 `REJECTED`일 때만 남긴다. */
  private async apply(
    eventId: string,
    result: SurveyAnswerEventResult,
  ): Promise<boolean> {
    return result.status === 'STORED'
      ? this.store.markFinal(eventId, SurveyAnswerSubmissionStatus.STORED, null)
      : this.store.markFinal(
          eventId,
          SurveyAnswerSubmissionStatus.REJECTED,
          result.reason,
        );
  }

  private async findResult(
    eventId: string,
  ): Promise<SurveyAnswerEventResult | 'unavailable' | null> {
    try {
      return await this.userClient.findSurveyAnswerResult(eventId);
    } catch {
      // 원인은 클라이언트가 이미 로그로 남겼다. 다음 점검에서 다시 본다.
      return 'unavailable';
    }
  }

  /** 환경 변수는 문자열로 들어온다. 숫자가 아니면 기본값을 쓴다. */
  private readNumber(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  private report(summary: ReconcileSummary): void {
    if (summary.checked === 0 && !summary.interrupted) {
      return;
    }

    this.logger.log(
      `설문 답변 접수 정합성 점검: 확인 ${summary.checked}건, 반영 ${summary.applied}건, 미처리 ${summary.unprocessedEventIds.length}건${summary.interrupted ? ', 유저 서비스 응답 없음으로 중단' : ''}${summary.truncated ? `, 상한 ${MAX_CHECKS_PER_RUN}건 도달` : ''}`,
    );
  }

  /**
   * 알림이 필요한 결과를 오류 로그로 남긴다. Discord 전송 여부와 상관없이 항상 남겨서, 웹훅이 없거나
   * 전송이 실패해도 결과가 사라지지 않게 한다.
   */
  private logAlert(summary: ReconcileSummary): void {
    const { shown, hidden } = this.alertEventIds(summary);
    const webhookConfigured = this.isWebhookConfigured();

    this.logger.error(
      [
        `설문 답변 접수 확인 필요: 미처리 ${summary.unprocessedEventIds.length}건, 확인 ${summary.checked}건`,
        shown.length > 0
          ? `미처리 eventId: ${shown.join(', ')}${hidden > 0 ? ` 외 ${hidden}건` : ''}`
          : undefined,
        summary.interrupted ? '유저 서비스 응답 없음으로 중단' : undefined,
        summary.truncated
          ? `상한 ${MAX_CHECKS_PER_RUN}건 도달 — 다음 점검에서 이어서 확인`
          : undefined,
        webhookConfigured ? undefined : 'Discord 웹훅 미설정 — 로그로만 알림',
      ]
        .filter((part) => part !== undefined)
        .join(' / '),
    );
  }

  private alertEventIds(summary: ReconcileSummary): {
    shown: string[];
    hidden: number;
  } {
    const shown = summary.unprocessedEventIds.slice(0, ALERT_EVENT_ID_LIMIT);
    return { shown, hidden: summary.unprocessedEventIds.length - shown.length };
  }

  private isWebhookConfigured(): boolean {
    return (this.config.get<string>('DISCORD_WEBHOOK_URL') ?? '') !== '';
  }

  private async alert(summary: ReconcileSummary): Promise<void> {
    // 웹훅이 없으면 Dicoshot은 보내지 않고도 성공으로 돌아온다. 오류 로그로 이미 남겼으니 부르지 않는다.
    if (!this.isWebhookConfigured()) {
      return;
    }

    const { shown, hidden } = this.alertEventIds(summary);
    const notes = [
      summary.interrupted
        ? '유저 서비스가 응답하지 않아 점검을 중단했습니다. 장애가 풀리면 다음 점검에서 이어서 봅니다.'
        : undefined,
      summary.truncated
        ? `한 번에 점검하는 상한(${MAX_CHECKS_PER_RUN}건)에 걸려 남은 기록이 더 있을 수 있습니다.`
        : undefined,
    ].filter((note) => note !== undefined);

    const delivered = await this.dicoshot.sendCustom({
      title: '설문 답변 접수 확인 필요',
      description: [
        '재발행 상한을 넘긴 설문 답변 접수 기록이 있습니다. 미처리 건은 README의 "설문 답변 접수 복구" 절차로 다시 보낼지 판단하세요.',
        ...notes,
      ].join('\n'),
      color: 'warning',
      fields: [
        {
          name: '유저 서비스 미처리',
          value: `${summary.unprocessedEventIds.length}건`,
          inline: true,
        },
        {
          name: '확인한 기록',
          value: `${summary.checked}건`,
          inline: true,
        },
        ...(shown.length > 0
          ? [
              {
                name: '미처리 eventId',
                value:
                  shown.join('\n') + (hidden > 0 ? `\n외 ${hidden}건` : ''),
              },
            ]
          : []),
      ],
    });
    if (!delivered) {
      this.logger.error(
        '설문 답변 접수 확인 알림을 Discord로 보내지 못했습니다. 위 오류 로그를 확인하세요.',
      );
    }
  }
}
