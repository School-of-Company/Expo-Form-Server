import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import {
  EXPO_CLIENT,
  type ExpoClient,
} from '../expo-client/expo-client.interface.js';
import { SurveyDrawResultStore } from './survey-draw-result.store.js';

/** 설정이 없거나 잘못됐을 때 쓰는 보관 일수. */
export const DEFAULT_LOTTERY_PHONE_RETENTION_DAYS = 30;

const DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

/** `yyyy-MM-dd` 날짜를 UTC 자정 시각(밀리초)으로 바꾼다. 형식이 틀리면 NaN이다. */
function toUtcDay(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (match?.groups === undefined) {
    return NaN;
  }

  const { year, month, day } = match.groups;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * 박람회가 끝난 뒤 보관 기간이 지났는지. 종료일 당일을 0일째로 세고, 종료일로부터 `retentionDays`일이 지난
 * 다음 날부터 만료다(종료일이 10월 31일이고 30일이면 11월 30일까지 보관하고 12월 1일부터 지운다).
 * 날짜를 읽을 수 없으면 지우지 않는 쪽(false)이다.
 */
export function isRetentionExpired(
  finishedDay: string,
  today: string,
  retentionDays: number,
): boolean {
  const finished = toUtcDay(finishedDay);
  const now = toUtcDay(today);
  if (Number.isNaN(finished) || Number.isNaN(now)) {
    return false;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  return now - finished > retentionDays * dayMs;
}

/** 한국 시간 기준 오늘 날짜(`yyyy-MM-dd`). */
function todayInKorea(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(
    now,
  );
}

/** 한 번 돌린 결과. 테스트와 로그에 쓴다. */
export interface RetentionSummary {
  /** 번호가 남아 있던 박람회 수 */
  checkedExpos: number;
  /** 번호를 지운 박람회 수 */
  purgedExpos: number;
  /** 지운 번호 건수 */
  clearedPhoneNumbers: number;
  /** 박람회 서비스에 확인하지 못해 이번에는 건너뛴 박람회 수 */
  skippedExpos: number;
}

/**
 * 경품 당첨 응답자의 전화번호를 보관 기간이 지나면 지운다.
 *
 * 번호는 당첨 문자를 보내려고만 받는 개인정보라 오래 두지 않는다. 박람회가 끝난 날로부터
 * `LOTTERY_PHONE_RETENTION_DAYS`일(기본 30일)이 지나면 그 박람회의 당첨 번호를 지우고, 당첨 순번과 발행
 * 기록은 남긴다. 그 안에는 당첨 문자가 실패해도 다시 보낼 수 있다.
 *
 * 박람회 종료일은 박람회 서비스가 알고 있다. 확인하지 못하면(장애·미설정) 지우지 않고 다음 주기에 다시
 * 확인한다 — 알 수 없다는 이유로 번호를 지우거나 영원히 두지 않기 위해서다. 박람회가 이미 없으면(404) 번호를
 * 둘 이유가 없어 지운다. 박람회 삭제 때는 설문과 함께 당첨 결과도 지워지므로 이 경우는 드물다.
 */
@Injectable()
export class LotteryPhoneRetentionService {
  private readonly logger = new Logger(LotteryPhoneRetentionService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly store: SurveyDrawResultStore,
    @Inject(EXPO_CLIENT) private readonly expoClient: ExpoClient,
  ) {}

  /** 하루에 한 번이면 충분하다. 새벽 3시(한국 시간)에 돈다. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Seoul' })
  async purgeExpired(now: Date = new Date()): Promise<RetentionSummary> {
    const summary: RetentionSummary = {
      checkedExpos: 0,
      purgedExpos: 0,
      clearedPhoneNumbers: 0,
      skippedExpos: 0,
    };

    // 같은 인스턴스에서 이전 정리가 아직 돌고 있으면 겹쳐 돌지 않는다.
    if (this.running) {
      this.logger.warn('이전 당첨 번호 정리가 끝나지 않아 건너뜁니다.');
      return summary;
    }

    this.running = true;
    try {
      const retentionDays = this.retentionDays();
      const today = todayInKorea(now);
      const expoIds = await this.store.findExpoIdsWithPhoneNumbers();
      summary.checkedExpos = expoIds.length;

      for (const expoId of expoIds) {
        // 박람회마다 순서대로 처리한다. 박람회 서비스를 한꺼번에 부르지 않는다.
        // eslint-disable-next-line no-await-in-loop
        await this.purgeExpo(expoId, today, retentionDays, summary);
      }
    } finally {
      this.running = false;
    }

    if (summary.clearedPhoneNumbers > 0 || summary.skippedExpos > 0) {
      this.logger.log(
        `당첨 번호 정리: 박람회 ${summary.checkedExpos}곳 확인, ${summary.purgedExpos}곳에서 ${summary.clearedPhoneNumbers}건 삭제, ${summary.skippedExpos}곳은 확인하지 못해 건너뜀`,
      );
    }

    return summary;
  }

  private async purgeExpo(
    expoId: string,
    today: string,
    retentionDays: number,
    summary: RetentionSummary,
  ): Promise<void> {
    try {
      const period = await this.expoClient.findPeriod(expoId);
      if (
        period !== null &&
        !isRetentionExpired(period.finishedDay, today, retentionDays)
      ) {
        return;
      }

      const cleared = await this.store.clearPhoneNumbers(expoId);
      summary.clearedPhoneNumbers += cleared;
      if (cleared > 0) {
        summary.purgedExpos += 1;
      }
    } catch (error) {
      if (error instanceof ExternalServiceUnavailableException) {
        summary.skippedExpos += 1;
        return;
      }

      // 한 박람회의 오류가 다른 박람회 정리를 막지 않게 하고, 다음 주기에 다시 시도한다.
      summary.skippedExpos += 1;
      this.logger.error(`당첨 번호 정리 실패: expoId=${expoId}`, error);
    }
  }

  /** 보관 일수. 설정이 없거나 1 미만의 정수가 아니면 기본값을 쓴다. */
  private retentionDays(): number {
    const raw = this.config.get<string>('LOTTERY_PHONE_RETENTION_DAYS');
    if (raw === undefined || raw === '') {
      return DEFAULT_LOTTERY_PHONE_RETENTION_DAYS;
    }

    const days = Number(raw);
    if (!Number.isSafeInteger(days) || days < 1) {
      this.logger.warn(
        `LOTTERY_PHONE_RETENTION_DAYS 값이 올바르지 않아 기본값 ${DEFAULT_LOTTERY_PHONE_RETENTION_DAYS}일을 씁니다.`,
      );
      return DEFAULT_LOTTERY_PHONE_RETENTION_DAYS;
    }

    return days;
  }
}
