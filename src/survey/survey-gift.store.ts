import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SurveyGiftPinEntity } from './entities/survey-gift-pin.entity.js';

/** 수령 상태. */
export type GiftClaimState = { claimedAt: Date | null; pinConfigured: boolean };

/** {@link SurveyGiftStore.confirm}의 결과. */
export type GiftConfirmResult =
  | { status: 'NOT_FOUND' }
  | { status: 'CLAIMED'; claimedAt: Date; alreadyClaimed: boolean };

/** 기념품 수령 확인(응답별 수령 기록·직원 PIN)의 영속성 접근을 모은 store. */
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
   * 토큰만으로 수령을 완료한다. `claimed_at IS NULL`인 행만 갱신하는 조건부 UPDATE 한 문장이라 같은 토큰의
   * 동시 확인·연타·재시도에서도 완료는 단 한 번이고, 이미 완료된 건은 시각을 다시 쓰지 않고 기존 완료 상태를 돌려준다.
   * 예전 PIN 방식이 남긴 틀린 횟수·잠금 값은 보지 않는다.
   *
   * @param surveyId 확인할 박람회의 설문 id
   * @param tokenHash 제출자가 낸 토큰의 해시
   */
  async confirm(
    surveyId: string,
    tokenHash: string,
  ): Promise<GiftConfirmResult> {
    return this.dataSource.transaction(async (manager) => {
      // TypeORM은 UPDATE의 결과를 `[행들, 건수]`로 돌려준다.
      const [, updated] = await manager.query<[unknown[], number]>(
        `UPDATE survey_gift_claim SET claimed_at = clock_timestamp(), failed_attempts = 0, locked_until = NULL
         WHERE survey_id = $1 AND token_hash = $2 AND claimed_at IS NULL`,
        [surveyId, tokenHash],
      );
      const [claim] = await manager.query<Array<{ claimedAt: Date | null }>>(
        `SELECT claimed_at AS "claimedAt" FROM survey_gift_claim WHERE survey_id = $1 AND token_hash = $2`,
        [surveyId, tokenHash],
      );
      if (claim?.claimedAt === undefined || claim.claimedAt === null) {
        return { status: 'NOT_FOUND' };
      }

      return {
        status: 'CLAIMED',
        claimedAt: claim.claimedAt,
        alreadyClaimed: updated === 0,
      };
    });
  }
}
