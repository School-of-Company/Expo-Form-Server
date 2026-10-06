import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type QueryDeepPartialEntity } from 'typeorm';
import { SurveyQrAnswerEntity } from './entities/survey-qr-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';

/** 현장 종이 QR 응답의 영속성 접근을 한 곳에 모아둔 store. */
@Injectable()
export class SurveyQrAnswerStore {
  constructor(
    @InjectRepository(SurveyQrAnswerEntity)
    private readonly qrAnswers: Repository<SurveyQrAnswerEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** 이 설문에서 이 토큰으로 이미 응답했는지만 확인한다. */
  async existsByKey(surveyId: string, token: string): Promise<boolean> {
    return this.qrAnswers.existsBy({ surveyId, token });
  }

  /**
   * 응답을 저장하고 설문의 누적 응답 수를 늘린다.
   *
   * `save`가 아니라 `insert`를 쓴다 — `(surveyId, token)`이 PK라 `save`는 이미 있는 row를
   * UPDATE로 덮어써 버린다. `insert`여야 같은 토큰의 두 번째 응답이 유니크 위반으로 막히고, 그 위반은 그대로
   * 던지므로 호출부가 409로 변환해야 한다. 위반 시 트랜잭션이 롤백되어 카운트도 늘지 않는다.
   */
  async create(
    surveyId: string,
    token: string,
    answers: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.insert(SurveyQrAnswerEntity, {
        surveyId,
        token,
        // QueryDeepPartialEntity가 Record<string, unknown>을 깊게 펼치다 타입이 어긋난다.
        // 값은 그대로 jsonb로 들어간다.
        answers: answers as QueryDeepPartialEntity<Record<string, unknown>>,
      });
      await manager.increment(
        SurveyEntity,
        { id: surveyId },
        'totalAnswers',
        1,
      );
    });
  }
}
