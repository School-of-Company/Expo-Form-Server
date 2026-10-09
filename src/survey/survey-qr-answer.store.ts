import { Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntityManager,
  type QueryDeepPartialEntity,
} from 'typeorm';
import { Occupation } from '../common/enums/occupation.enum.js';
import { SurveyNotFoundException } from '../common/exceptions/domain.exception.js';
import { SurveyQrAnswerEntity } from './entities/survey-qr-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';

/** 경품 설정을 잠그고 읽은 한 줄. 컬럼 이름 그대로 돌려받는다. */
type LotteryRow = {
  lottery_enabled: boolean;
  lottery_numbers: number[];
  lottery_sequence: number;
};

/** 공개 링크 익명 응답의 영속성 접근을 한 곳에 모아둔 store. */
@Injectable()
export class SurveyQrAnswerStore {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 응답을 저장하고 설문의 누적 응답 수를 늘린다.
   *
   * 응답자를 식별하지 않아 같은 응답자의 중복을 막지 않는다. `token`은 종이 QR 시절 응답에만 남아 있는
   * 값이라 새 응답에는 쓰지 않는다.
   *
   * `lotteryPhoneNumber`가 있고 설문의 경품 추첨이 켜져 있으면 같은 트랜잭션에서 추첨에 참여시킨다
   * ({@link joinLottery}). 추첨이 꺼져 있으면 번호를 저장하지 않고 응답만 받는다.
   *
   * @throws {SurveyNotFoundException} 번호를 받으려 설문을 잠그는 순간 설문이 이미 지워졌을 때
   */
  async create(
    surveyId: string,
    answers: Record<string, unknown>,
    occupation: Occupation,
    lotteryPhoneNumber: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 번호를 받는 응답은 설문 행을 먼저 잠근다. 같은 설문의 순번이 겹치지 않게 줄 세우는 자리이고, 응답
      // INSERT보다 앞에 둬야 FK 검사의 공유 잠금과 맞물려 교착이 나지 않는다.
      const lottery =
        lotteryPhoneNumber === null
          ? null
          : await this.lockLottery(manager, surveyId);

      await manager.insert(SurveyQrAnswerEntity, {
        surveyId,
        // QueryDeepPartialEntity가 Record<string, unknown>을 깊게 펼치다 타입이 어긋난다.
        // 값은 그대로 jsonb로 들어간다.
        answers: answers as QueryDeepPartialEntity<Record<string, unknown>>,
        occupation,
      });
      await manager.increment(
        SurveyEntity,
        { id: surveyId },
        'totalAnswers',
        1,
      );

      if (lotteryPhoneNumber !== null && lottery?.lottery_enabled === true) {
        await this.joinLottery(manager, surveyId, lotteryPhoneNumber, lottery);
      }
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
   * 번호를 추첨에 넣고, 새 번호이면 순번을 올려 당첨 목록에 있는지 본다.
   *
   * 같은 번호의 재응답은 순번을 올리지 않는다 — 유니크 제약 위반을 `ON CONFLICT DO NOTHING`으로 받아 이미 들어온
   * 번호인지 판정한다. 당첨이면 발행할 결과를 같은 트랜잭션에 남긴다. 설문 행을 이미 잠갔으므로 순번을 읽은
   * 값에서 1 올려도 다른 응답과 겹치지 않는다.
   */
  private async joinLottery(
    manager: EntityManager,
    surveyId: string,
    phoneNumber: string,
    lottery: LotteryRow,
  ): Promise<void> {
    const sequence = lottery.lottery_sequence + 1;
    const entered = await manager.query<unknown[]>(
      `INSERT INTO survey_lottery_entry (survey_id, phone_number, sequence) VALUES ($1, $2, $3) ON CONFLICT (survey_id, phone_number) DO NOTHING RETURNING id`,
      [surveyId, phoneNumber, sequence],
    );
    if (entered.length === 0) {
      return;
    }

    await manager.query(
      `UPDATE survey SET lottery_sequence = $2 WHERE id = $1`,
      [surveyId, sequence],
    );

    if (lottery.lottery_numbers.includes(sequence)) {
      await manager.query(
        `INSERT INTO survey_draw_result (event_id, survey_id, draw_number, phone_number) VALUES (uuid_generate_v4(), $1, $2, $3) ON CONFLICT (survey_id, draw_number) DO NOTHING`,
        [surveyId, sequence, phoneNumber],
      );
    }
  }
}
