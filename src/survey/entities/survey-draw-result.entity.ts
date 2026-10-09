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
import { LOTTERY_PHONE_MAX_LENGTH } from './survey-lottery-entry.entity.js';
import { SurveyEntity } from './survey.entity.js';

/**
 * 경품 당첨 결과를 알림 서비스로 보내는 아웃박스 레코드.
 *
 * 당첨 판정과 같은 트랜잭션에서 저장하고, 실제 Kafka 발행은 별도 릴레이가 맡는다 — DB 커밋과 발행을 한
 * 트랜잭션으로 묶을 수 없어서 커밋은 여기서 끝내고 발행을 뒤로 미룬다. `eventId`는 한 번 만들고 재발행에도
 * 그대로 쓴다 — 알림 서비스가 이 값을 멱등키로 문자를 한 번만 보내기 때문이다.
 *
 * 같은 설문에서 같은 당첨 순번은 한 번만 만들어진다(`(surveyId, drawNumber)` 유니크).
 */
@Index(['surveyId', 'drawNumber'], { unique: true })
@Entity('survey_draw_result')
export class SurveyDrawResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 발행 멱등키. 결과를 만들 때 DB가 채운다(`uuid_generate_v4()`). */
  @Column({ type: 'uuid', unique: true })
  eventId: string;

  @Column({ type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  /** 당첨된 순번. 문자에 "N번!"으로 들어간다. */
  @Column({ type: 'int' })
  drawNumber: number;

  @Column({ type: 'varchar', length: LOTTERY_PHONE_MAX_LENGTH })
  phoneNumber: string;

  /** 발행에 성공한 시각. 비어 있으면 아직 발행하지 않은 것이다. */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
