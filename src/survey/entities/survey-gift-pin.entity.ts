import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { SurveyEntity } from './survey.entity.js';

/**
 * 박람회(설문)별 기념품 수령 확인용 공용 직원 PIN. 원문은 저장하지 않고 salt를 붙인 scrypt 해시만 둔다.
 * 설문이 지워지면 함께 지워진다.
 */
@Entity('survey_gift_pin')
export class SurveyGiftPinEntity {
  @PrimaryColumn({ type: 'uuid' })
  surveyId: string;

  @OneToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  /** `scrypt$<salt hex>$<hash hex>`. */
  @Column({ type: 'varchar', length: 200 })
  pinHash: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
