import { Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntityManager,
  type QueryDeepPartialEntity,
} from 'typeorm';
import { Occupation } from '../common/enums/occupation.enum.js';
import { SurveyNotFoundException } from '../common/exceptions/domain.exception.js';
import { SurveyGiftClaimEntity } from './entities/survey-gift-claim.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';

/** 경품 설정을 잠그고 읽은 한 줄. 컬럼 이름 그대로 돌려받는다. */
type LotteryRow = {
  lottery_enabled: boolean;
  lottery_numbers: number[];
  lottery_sequence: number;
};

/** 응답을 저장하면서 한 추첨의 결과. 당첨이면 몇 번째 응답이었는지 함께 돌려준다. */
export type DrawOutcome =
  { won: true; drawNumber: number } | { won: false; drawNumber: null };

const NOT_WON: DrawOutcome = { won: false, drawNumber: null };

/** 공개 응답을 DB 정밀도(마이크로초) 그대로의 UTC 문자열로 읽는다. JS `Date`로 받으면 커서가 밀리초로 잘린다. */
const UTC_MICROS = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/** 커서 조회로 읽은 공개 응답 한 줄. */
export type PublicAnswerRow = {
  id: string;
  createdAt: string;
  occupation: Occupation;
  answers: Record<string, unknown>;
};

/** 공개 응답 한 페이지. `rows`는 `(createdAt, id)` 오름차순이다. */
export type PublicAnswerPage = {
  snapshotAt: string;
  totalCount: number;
  rows: PublicAnswerRow[];
};

/** 공개 링크 익명 응답의 영속성 접근을 한 곳에 모아둔 store. */
@Injectable()
export class SurveyPublicAnswerStore {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 응답을 저장하고 설문의 누적 응답 수를 늘린다(순번과 같은 UPDATE 한 번, #137). 경품 추첨이 켜져 있으면 같은 트랜잭션에서 이 응답의
   * 순번을 매겨 당첨인지 정한다.
   *
   * 응답자를 식별하지 않아 같은 응답자의 중복을 막지 않는다.
   *
   * 설문 행을 먼저 잠근다 — 같은 설문의 순번이 겹치지 않게 줄 세우는 자리이고, 응답 INSERT보다 앞에 둬야
   * FK 검사의 공유 잠금과 맞물려 교착이 나지 않는다.
   *
   * `lotteryPhoneNumber`는 당첨됐을 때 문자를 보낼 번호다. 입력하지 않았으면 `null`이고 추첨 대상에서 뺀다 —
   * 순번도 소비하지 않고 당첨되지 않는다(#169). 같은 설문에서 이미 추첨에 참여한 번호도 순번을 소비하지 않는다(#182).
   *
   * `giftTokenHash`가 있으면 그 응답의 기념품 수령 기록도 같은 트랜잭션에서 만든다.
   *
   * @throws {SurveyNotFoundException} 설문 행을 잠그는 순간 설문이 이미 지워졌을 때
   */
  async create(
    surveyId: string,
    answers: Record<string, unknown>,
    occupation: Occupation,
    lotteryPhoneNumber: string | null,
    giftTokenHash: string | null = null,
  ): Promise<DrawOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const lottery = await this.lockLottery(manager, surveyId);

      const inserted = await manager.insert(SurveyPublicAnswerEntity, {
        surveyId,
        // QueryDeepPartialEntity가 Record<string, unknown>을 깊게 펼치다 타입이 어긋난다.
        // 값은 그대로 jsonb로 들어간다.
        answers: answers as QueryDeepPartialEntity<Record<string, unknown>>,
        occupation,
        // 트랜잭션 시작 시각(now())이 아니라 설문 행을 잠근 뒤의 시각이다. 응답 조회가 같은 행을 잠그고 정한 상한보다
        // 늦게 커밋되는 응답은 반드시 그 상한보다 늦은 시각을 갖는다(#215).
        createdAt: () => 'clock_timestamp()',
      });

      // 수령 기록은 응답과 같은 트랜잭션에서 만든다 — 응답만 남거나 토큰만 남는 일이 없다(#239).
      if (giftTokenHash !== null) {
        await manager.insert(SurveyGiftClaimEntity, {
          surveyId,
          answerId: (inserted.identifiers[0] as { id: string }).id,
          tokenHash: giftTokenHash,
        });
      }

      // 번호 없는 응답은 추첨에 넣지 않는다(#169). 같은 사람의 반복 당첨을 막을 기준이 없다.
      const joined =
        lotteryPhoneNumber !== null && lottery.lottery_enabled
          ? await this.joinLottery(manager, surveyId, lotteryPhoneNumber)
          : false;

      // 설문 행 UPDATE는 한 번이다(#137). 응답 수는 늘 1 늘고, 순번은 참여가 새로 인정된 응답만 소비한다.
      await manager.query(
        `UPDATE survey SET total_answers = total_answers + 1, lottery_sequence = lottery_sequence + $2 WHERE id = $1`,
        [surveyId, joined ? 1 : 0],
      );
      // 행을 잠근 채 읽었으므로 이 값 + 1이 방금 UPDATE가 매긴 순번이다.
      const sequence = lottery.lottery_sequence + 1;

      return joined &&
        lotteryPhoneNumber !== null &&
        lottery.lottery_numbers.includes(sequence)
        ? this.recordWin(manager, surveyId, lotteryPhoneNumber, sequence)
        : NOT_WON;
    });
  }

  /**
   * 조회 상한을 정한다. 설문 행을 공유 잠금으로 잡아 진행 중인 응답 저장(행을 잠근 채 `clock_timestamp()`로
   * 시각을 매긴다)이 끝나길 기다린 뒤 시각을 읽으므로, 상한 이하의 응답은 이미 모두 커밋돼 있고 이후 응답은 상한보다
   * 늦다. 그래서 상한을 고정한 페이지 조회는 그 사이 새 응답이 들어와도 빠지거나 겹치지 않는다(#215).
   *
   * @throws {SurveyNotFoundException} 설문이 그새 지워졌을 때
   */
  async snapshot(surveyId: string): Promise<string> {
    // ponytail: 서버 시계가 뒤로 가지 않는다고 가정한다. 거꾸로 가면 순번 컬럼(sequence)으로 바꿔야 한다.
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.query<unknown[]>(
        `SELECT id FROM survey WHERE id = $1 FOR SHARE`,
        [surveyId],
      );
      if (locked.length === 0) {
        throw new SurveyNotFoundException();
      }

      const [row] = await manager.query<Array<{ at: string }>>(
        `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', ${UTC_MICROS}) AS at`,
      );
      return row.at;
    });
  }

  /**
   * 상한 이하의 응답을 `(createdAt, id)` 순서로 `after` 다음부터 `limit`+1개까지 읽는다. 하나 더 읽는 건
   * 다음 페이지가 있는지 보려는 것이다.
   */
  async findPage(
    surveyId: string,
    snapshotAt: string,
    after: { createdAt: string; id: string } | null,
    limit: number,
  ): Promise<PublicAnswerPage> {
    // ponytail: (survey_id, created_at, id) 인덱스 없이 훑는다. 설문당 응답이 수만 건을 넘으면 인덱스를 추가한다.
    const rows = await this.dataSource.query<PublicAnswerRow[]>(
      `SELECT id, occupation, answers, to_char(created_at AT TIME ZONE 'UTC', ${UTC_MICROS}) AS "createdAt"
         FROM survey_public_answer
        WHERE survey_id = $1 AND created_at <= $2::timestamptz
          AND ($3::timestamptz IS NULL OR (created_at, id) > ($3::timestamptz, $4::uuid))
        ORDER BY created_at, id
        LIMIT $5`,
      [
        surveyId,
        snapshotAt,
        after?.createdAt ?? null,
        after?.id ?? null,
        limit + 1,
      ],
    );
    const [{ count }] = await this.dataSource.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM survey_public_answer WHERE survey_id = $1 AND created_at <= $2::timestamptz`,
      [surveyId, snapshotAt],
    );

    return { snapshotAt, totalCount: count, rows };
  }

  private async lockLottery(
    manager: EntityManager,
    surveyId: string,
  ): Promise<LotteryRow> {
    const rows = await manager.query<LotteryRow[]>(
      `SELECT lottery_enabled, lottery_numbers, lottery_sequence FROM survey WHERE id = $1 FOR NO KEY UPDATE`,
      [surveyId],
    );
    if (rows.length === 0) {
      throw new SurveyNotFoundException();
    }

    return rows[0];
  }

  /**
   * 이 번호를 설문의 추첨 참여로 기록한다. 설문마다 번호별로 한 번만 센다(#182) — 이미 참여한 번호면 `false`라
   * 순번을 소비하지 않고 당첨되지 않는다. 설문 행 락 아래에서 기록하므로 같은 번호의 동시 제출도 하나만 `true`다.
   */
  private async joinLottery(
    manager: EntityManager,
    surveyId: string,
    phoneNumber: string,
  ): Promise<boolean> {
    const joined = await manager.query<unknown[]>(
      `INSERT INTO survey_lottery_participant (survey_id, phone_number) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING survey_id`,
      [surveyId, phoneNumber],
    );

    return joined.length > 0;
  }

  /**
   * 당첨된 순번이면 그 번호로 문자를 보내도록 발행 대기 상태의 기록을 같은 트랜잭션에 남긴다.
   */
  private async recordWin(
    manager: EntityManager,
    surveyId: string,
    phoneNumber: string,
    sequence: number,
  ): Promise<DrawOutcome> {
    await manager.query(
      `INSERT INTO survey_draw_result (event_id, survey_id, draw_number, phone_number) VALUES (uuid_generate_v4(), $1, $2, $3) ON CONFLICT (survey_id, draw_number) DO NOTHING`,
      [surveyId, sequence, phoneNumber],
    );

    return { won: true, drawNumber: sequence };
  }
}
