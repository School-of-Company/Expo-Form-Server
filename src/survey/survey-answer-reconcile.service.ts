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

/** 한 번에 점검할 최대 건수. */
const BATCH_SIZE = 100;

/** 알림 한 번에 실을 eventId 수. 나머지는 개수로만 알린다. */
const ALERT_EVENT_ID_LIMIT = 10;

/** 점검 한 번의 결과. */
export type ReconcileSummary = {
  /** 점검한 기록 수. */
  checked: number;
  /** 유저 서비스의 처리 결과를 받아 `STORED`/`REJECTED`로 맞춘 수. */
  applied: number;
  /** 유저 서비스가 처리한 적 없다고 답한 기록 — 사람이 재발행 여부를 판단해야 한다. */
  unprocessedEventIds: string[];
  /** 유저 서비스에서 응답을 받지 못해 이번에 판단하지 못한 수. 다음 점검에서 다시 본다. */
  unavailable: number;
};

/**
 * 설문 답변 접수(아웃박스)의 정합성 점검.
 *
 * 릴레이는 결과를 못 받은 `PUBLISHED` 기록을 재발행 상한까지만 다시 보내고 그 뒤로는 손을 뗀다.
 * 그런 기록은 `totalAnswers`만 늘어 있고 유저 서비스에 저장됐는지 알 수 없는 채로 남는다. 이
 * 서비스가 주기적으로 그런 기록을 찾아 유저 서비스에 처리 결과를 직접 묻는다.
 *
 * - 처리 결과가 있으면(결과 이벤트만 유실된 경우) 결과 컨슈머와 같은 경로(`markFinal`)로 반영한다.
 *   `REJECTED`면 누적 응답 수도 같은 트랜잭션에서 되돌아간다.
 * - 처리한 적 없다거나 응답을 받지 못하면 상태는 건드리지 않고 Discord로 알린다. 다시 보낼지는
 *   사람이 판단한다(README의 복구 절차).
 */
@Injectable()
export class SurveyAnswerReconcileService {
  private readonly logger = new Logger(SurveyAnswerReconcileService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly store: SurveyAnswerSubmissionStore,
    @Inject(USER_CLIENT) private readonly userClient: UserClient,
    private readonly dicoshot: DicoshotService,
  ) {}

  /** 재발행 상한(기본 5회 × 5분)을 다 쓴 기록이 대상이라 매시간이면 충분하다. */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcile(): Promise<ReconcileSummary> {
    // 환경 변수는 문자열로 들어온다. `get<number>`로 읽으면 타입만 숫자고 값은 문자열이다.
    const maxRetryCount = Number(
      this.config.get<string>('SURVEY_ANSWER_MAX_RETRY_COUNT') ?? '5',
    );
    const exhausted = await this.store.findExhausted(maxRetryCount, BATCH_SIZE);
    const summary: ReconcileSummary = {
      checked: exhausted.length,
      applied: 0,
      unprocessedEventIds: [],
      unavailable: 0,
    };

    for (const { eventId } of exhausted) {
      // 유저 서비스에 한꺼번에 몰리지 않도록 한 건씩 묻는다.
      // eslint-disable-next-line no-await-in-loop
      const result = await this.findResult(eventId);

      if (result === 'unavailable') {
        summary.unavailable++;
      } else if (result === null) {
        summary.unprocessedEventIds.push(eventId);
      } else if (
        // eslint-disable-next-line no-await-in-loop
        await this.store.markFinal(
          eventId,
          result.status === 'STORED'
            ? SurveyAnswerSubmissionStatus.STORED
            : SurveyAnswerSubmissionStatus.REJECTED,
          result.reason,
        )
      ) {
        summary.applied++;
      }
    }

    if (summary.checked > 0) {
      this.logger.log(
        `설문 답변 접수 정합성 점검: 대상 ${summary.checked}건, 반영 ${summary.applied}건, 미처리 ${summary.unprocessedEventIds.length}건, 확인 불가 ${summary.unavailable}건`,
      );
    }

    if (summary.unprocessedEventIds.length > 0 || summary.unavailable > 0) {
      await this.alert(summary);
    }

    return summary;
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

  private async alert(summary: ReconcileSummary): Promise<void> {
    const shown = summary.unprocessedEventIds.slice(0, ALERT_EVENT_ID_LIMIT);
    const hidden = summary.unprocessedEventIds.length - shown.length;

    await this.dicoshot.sendCustom({
      title: '설문 답변 접수 확인 필요',
      description:
        '재발행 상한을 넘긴 설문 답변 접수 기록이 있습니다. 미처리 건은 README의 "설문 답변 접수 복구" 절차로 다시 보낼지 판단하세요.',
      color: 'warning',
      fields: [
        {
          name: '유저 서비스 미처리',
          value: `${summary.unprocessedEventIds.length}건`,
          inline: true,
        },
        {
          name: '확인 불가(유저 서비스 응답 없음)',
          value: `${summary.unavailable}건`,
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
  }
}
