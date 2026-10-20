import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { LOTTERY_PHONE_MAX_LENGTH } from './survey-draw-result.entity.js';
import { SurveyEntity } from './survey.entity.js';

/**
 * 설문의 경품 추첨에 이미 참여한 번호. 번호마다 설문당 한 번만 순번을 소비하게 하려고 둔다(#182) — 같은 번호로
 * 다시 응답해도 순번을 소비하거나 당첨 확률을 올리지 못한다.
 *
 * 번호는 개인정보라 당첨 번호와 같은 보관 기간(`LOTTERY_PHONE_RETENTION_DAYS`)이 지나면
 * `LotteryPhoneRetentionService`가 행을 지운다.
 */
@Entity('survey_lottery_participant')
export class SurveyLotteryParticipantEntity {
  @PrimaryColumn({ type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  /** 정규화한 번호(`01XXXXXXXXX`). */
  @PrimaryColumn({ type: 'varchar', length: LOTTERY_PHONE_MAX_LENGTH })
  phoneNumber: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
