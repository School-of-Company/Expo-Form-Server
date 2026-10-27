import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SurveyGiftPinEntity } from './entities/survey-gift-pin.entity.js';

/** 한 토큰에서 PIN을 이만큼 연속으로 틀리면 잠근다. */
export const GIFT_PIN_MAX_FAILED_ATTEMPTS = 5;
/** 잠금 시간(초). 그 토큰에만 걸리고 지나면 틀린 횟수를 다시 센다. */
export const GIFT_PIN_LOCK_SECONDS = 300;

/** 수령 상태. */
export type GiftClaimState = { claimedAt: Date | null; pinConfigured: boolean };

/** {@link SurveyGiftStore.confirm}의 결과. 정책 판단은 여기서 끝내고 예외로 바꾸는 건 서비스가 한다. */
export type GiftConfirmResult =
  | { status: 'NOT_FOUND' }
  | { status: 'NO_PIN' }
  | { status: 'CLAIMED'; claimedAt: Date; alreadyClaimed: boolean }
  | { status: 'LOCKED'; retryAfterSeconds: number }
  | { status: 'INVALID'; attemptsLeft: number };

type ClaimRow = {
  id: string;
  claimedAt: Date | null;
  failedAttempts: number;
  lockRemaining: number;
};

/** 기념품 수령 확인(직원 PIN·응답별 수령 기록)의 영속성 접근을 모은 store. */
@Injectable()
export class SurveyGiftStore {
  constructor(private readonly dataSource: DataSource) {}

  async hasPin(surveyId: string): Promise<boolean> {
    return this.dataSource.manager.existsBy(SurveyGiftPinEntity, { surveyId });
  }

  /** PIN 해시를 설정하거나 바꾼다. 이미 발급된 수령 토큰은 그대로 쓸 수 있다. */
  async savePin(surveyId: string, pinHash: string): Promise<void> {
    await this.dataSource.manager.upsert(
      SurveyGiftPinEntity,
      { surveyId, pinHash, updatedAt: () => 'now()' },
      ['surveyId'],
    );
  }

  /** 토큰의 수령 상태. 이 설문의 토큰이 아니면 `null`이다. */
  async findState(
    surveyId: string,
    tokenHash: string,
  ): Promise<GiftClaimState | null> {
    const [row] = await this.dataSource.query<
      Array<{ claimedAt: Date | null; pinConfigured: boolean }>
    >(
      `SELECT c.claimed_at AS "claimedAt", EXISTS (SELECT 1 FROM survey_gift_pin p WHERE p.survey_id = c.survey_id) AS "pinConfigured"
       FROM survey_gift_claim c WHERE c.survey_id = $1 AND c.token_hash = $2`,
      [surveyId, tokenHash],
    );

    return row === undefined
      ? null
      : { claimedAt: row.claimedAt, pinConfigured: row.pinConfigured };
  }

  /**
   * PIN을 확인하고 수령을 완료한다. 수령 행을 `FOR UPDATE`로 잠가 같은 토큰의 동시 확인·연타·재시도가 한 줄로
   * 서게 하므로, 완료는 단 한 번이고 이미 완료된 건은 PIN 없이 완료 상태를 그대로 돌려준다.
   *
   * 틀린 횟수와 잠금은 이 트랜잭션 안에서 올리고 결과로 돌려준다(예외로 던지면 롤백돼 횟수가 안 오른다).
   *
   * @param surveyId 확인할 박람회의 설문 id
   * @param tokenHash 제출자가 낸 토큰의 해시
   * @param verifyPin 저장된 PIN 해시와 입력한 PIN이 같은지 확인하는 함수
   */
  async confirm(
    surveyId: string,
    tokenHash: string,
    verifyPin: (pinHash: string) => Promise<boolean>,
  ): Promise<GiftConfirmResult> {
    return this.dataSource.transaction(async (manager) => {
      const [claim] = await manager.query<ClaimRow[]>(
        `SELECT id, claimed_at AS "claimedAt", failed_attempts AS "failedAttempts",
                CEIL(GREATEST(EXTRACT(EPOCH FROM (locked_until - clock_timestamp())), 0))::int AS "lockRemaining"
         FROM survey_gift_claim WHERE survey_id = $1 AND token_hash = $2 FOR UPDATE`,
        [surveyId, tokenHash],
      );
      if (claim === undefined) {
        return { status: 'NOT_FOUND' };
      }

      if (claim.claimedAt !== null) {
        return {
          status: 'CLAIMED',
          claimedAt: claim.claimedAt,
          alreadyClaimed: true,
        };
      }

      const pin = await manager.findOneBy(SurveyGiftPinEntity, { surveyId });
      if (!pin) {
        return { status: 'NO_PIN' };
      }

      if (claim.lockRemaining > 0) {
        return { status: 'LOCKED', retryAfterSeconds: claim.lockRemaining };
      }

      if (await verifyPin(pin.pinHash)) {
        await manager.query(
          `UPDATE survey_gift_claim SET claimed_at = clock_timestamp(), failed_attempts = 0, locked_until = NULL WHERE id = $1`,
          [claim.id],
        );
        // TypeORM은 UPDATE ... RETURNING의 결과를 `[행들, 건수]`로 돌려줘서, 시각은 같은 트랜잭션에서 다시 읽는다.
        const [done] = await manager.query<Array<{ claimedAt: Date }>>(
          `SELECT claimed_at AS "claimedAt" FROM survey_gift_claim WHERE id = $1`,
          [claim.id],
        );
        return {
          status: 'CLAIMED',
          claimedAt: done.claimedAt,
          alreadyClaimed: false,
        };
      }

      const failed = claim.failedAttempts + 1;
      if (failed >= GIFT_PIN_MAX_FAILED_ATTEMPTS) {
        await manager.query(
          `UPDATE survey_gift_claim SET failed_attempts = 0,
                  locked_until = clock_timestamp() + make_interval(secs => $2) WHERE id = $1`,
          [claim.id, GIFT_PIN_LOCK_SECONDS],
        );
        return { status: 'LOCKED', retryAfterSeconds: GIFT_PIN_LOCK_SECONDS };
      }

      await manager.query(
        `UPDATE survey_gift_claim SET failed_attempts = $2 WHERE id = $1`,
        [claim.id, failed],
      );
      return {
        status: 'INVALID',
        attemptsLeft: GIFT_PIN_MAX_FAILED_ATTEMPTS - failed,
      };
    });
  }
}
