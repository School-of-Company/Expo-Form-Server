import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { SurveyEntity } from './survey.entity.js';

/** 정규화한 전화번호(`01XXXXXXXXX`)의 최대 길이. */
export const LOTTERY_PHONE_MAX_LENGTH = 11;

/**
 * 경품 추첨에 참여한 번호. 설문마다 같은 번호는 한 번만 들어가고, 그때 매긴 순번을 함께 남긴다.
 *
 * 같은 번호로 다시 응답해도 순번을 올리지 않아야 반복 응답으로 순번을 소비하거나 당첨 확률을 올리지
 * 못한다 — `(surveyId, phoneNumber)` 유니크 제약이 그것을 DB에서 막는다. 순번도 설문 안에서 겹치지 않는다.
 * 전화번호는 개인정보라 로그에 남기지 않고, 추첨이 끝난 뒤 보관 기간을 정해 지운다.
 */
@Index(['surveyId', 'phoneNumber'], { unique: true })
@Index(['surveyId', 'sequence'], { unique: true })
@Entity('survey_lottery_entry')
export class SurveyLotteryEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  @Column({ type: 'varchar', length: LOTTERY_PHONE_MAX_LENGTH })
  phoneNumber: string;

  /** 이 번호가 추첨에 들어올 때 매긴 순번. */
  @Column({ type: 'int' })
  sequence: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
