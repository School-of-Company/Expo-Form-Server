import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
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
}
