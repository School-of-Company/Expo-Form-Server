import { Injectable } from '@nestjs/common';
import { DataSource, type QueryDeepPartialEntity } from 'typeorm';
import { Occupation } from '../common/enums/occupation.enum.js';
import { SurveyQrAnswerEntity } from './entities/survey-qr-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';

/** 공개 링크 익명 응답의 영속성 접근을 한 곳에 모아둔 store. */
@Injectable()
export class SurveyQrAnswerStore {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 응답을 저장하고 설문의 누적 응답 수를 늘린다.
   *
   * 응답자를 식별하지 않아 같은 응답자의 중복을 막지 않는다. `token`은 종이 QR 시절 응답에만 남아 있는
   * 값이라 새 응답에는 쓰지 않는다.
   */
  async create(
    surveyId: string,
    answers: Record<string, unknown>,
    occupation: Occupation,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
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
    });
  }
}
