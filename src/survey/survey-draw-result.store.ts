import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';

/** 경품 당첨 결과(아웃박스) 영속성 접근을 한 곳에 모아둔 store. */
@Injectable()
export class SurveyDrawResultStore {
  constructor(
    @InjectRepository(SurveyDrawResultEntity)
    private readonly drawResults: Repository<SurveyDrawResultEntity>,
  ) {}

  /** 아직 발행하지 않았고 문자를 보낼 번호가 있는 결과를 오래된 순서로 돌려준다. 번호 없이 당첨된 기록은 제외한다. */
  async findUnpublished(limit: number): Promise<SurveyDrawResultEntity[]> {
    return this.drawResults.find({
      where: { publishedAt: IsNull(), phoneNumber: Not(IsNull()) },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.drawResults.update(id, { publishedAt: new Date() });
  }

  /** 아직 전화번호가 남아 있는 당첨 결과가 있는 박람회 id 목록. 정리 대상 박람회를 고를 때 쓴다. */
  async findExpoIdsWithPhoneNumbers(): Promise<string[]> {
    const rows = await this.drawResults
      .createQueryBuilder('result')
      .innerJoin(SurveyEntity, 'survey', 'survey.id = result.surveyId')
      .select('survey.expoId', 'expoId')
      .where('result.phoneNumber IS NOT NULL')
      .distinct(true)
      .getRawMany<{ expoId: string }>();

    return rows.map((row) => row.expoId);
  }

  /**
   * 박람회의 당첨 결과에서 전화번호만 지운다. 당첨 순번과 발행 기록은 남는다.
   *
   * @returns 번호를 지운 건수
   */
  async clearPhoneNumbers(expoId: string): Promise<number> {
    // 서브쿼리를 문자열로 직접 쓰면 `survey`가 이 엔티티의 관계 속성 이름과 같아 TypeORM이 컬럼명으로 바꿔 버린다.
    // 엔티티로 만든 서브쿼리를 쓰면 테이블 이름이 정확히 나간다.
    const surveyIds = this.drawResults.manager
      .createQueryBuilder()
      .select('survey.id')
      .from(SurveyEntity, 'survey')
      .where('survey.expoId = :expoId')
      .getQuery();

    const result = await this.drawResults
      .createQueryBuilder()
      .update(SurveyDrawResultEntity)
      .set({ phoneNumber: null })
      .where('phone_number IS NOT NULL')
      .andWhere(`survey_id IN (${surveyIds})`)
      .setParameter('expoId', expoId)
      .execute();

    return result.affected ?? 0;
  }
}
