import { Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntityManager,
  type QueryDeepPartialEntity,
} from 'typeorm';
import { Occupation } from '../common/enums/occupation.enum.js';
import { SurveyNotFoundException } from '../common/exceptions/domain.exception.js';
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
   * @throws {SurveyNotFoundException} 설문 행을 잠그는 순간 설문이 이미 지워졌을 때
   */
  async create(
    surveyId: string,
    answers: Record<string, unknown>,
    occupation: Occupation,
    lotteryPhoneNumber: string | null,
  ): Promise<DrawOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const lottery = await this.lockLottery(manager, surveyId);

      await manager.insert(SurveyPublicAnswerEntity, {
        surveyId,
        // QueryDeepPartialEntity가 Record<string, unknown>을 깊게 펼치다 타입이 어긋난다.
        // 값은 그대로 jsonb로 들어간다.
        answers: answers as QueryDeepPartialEntity<Record<string, unknown>>,
        occupation,
      });

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
      if (!joined || lotteryPhoneNumber === null) {
        return NOT_WON;
      }

      return this.recordIfWon(
        manager,
        surveyId,
        lotteryPhoneNumber,
        // 행을 잠근 채 읽었으므로 이 값 + 1이 방금 UPDATE가 매긴 순번이다.
        lottery.lottery_sequence + 1,
        lottery.lottery_numbers,
      );
    });
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
   * 매겨진 순번이 당첨 번호 목록에 있으면 그 번호로 문자를 보내도록 발행 대기 상태의 기록을 같은 트랜잭션에 남긴다.
   */
  private async recordIfWon(
    manager: EntityManager,
    surveyId: string,
    phoneNumber: string,
    sequence: number,
    winningNumbers: number[],
  ): Promise<DrawOutcome> {
    if (!winningNumbers.includes(sequence)) {
      return NOT_WON;
    }

    await manager.query(
      `INSERT INTO survey_draw_result (event_id, survey_id, draw_number, phone_number) VALUES (uuid_generate_v4(), $1, $2, $3) ON CONFLICT (survey_id, draw_number) DO NOTHING`,
      [surveyId, sequence, phoneNumber],
    );

    return { won: true, drawNumber: sequence };
  }
}
