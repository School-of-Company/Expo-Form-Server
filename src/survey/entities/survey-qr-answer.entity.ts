import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { SurveyEntity } from './survey.entity.js';

/**
 * 현장 종이 QR로 들어온 익명 설문 응답. 응답자 정보가 없어서 유저 서비스에 보낼 수 없고,
 * 묶을 사람이 없으니 답변을 이 서비스가 직접 저장한다 — "답변은 유저 서비스가 저장"
 * 원칙의 유일한 예외다.
 *
 * 토큰은 참여 서비스가 발급·소유하고 이 서비스는 발급하지 않는다. 토큰이 PK라서 같은 토큰으로
 * 두 번 응답하면 INSERT가 유니크 위반으로 막힌다 — 응답이 있을 때만 row가 생긴다.
 */
@Entity('survey_qr_answer')
export class SurveyQrAnswerEntity {
  /** 참여 서비스가 발급한 토큰. 형식은 참여 서비스가 정한다. */
  @PrimaryColumn({ length: 64 })
  token: string;

  @Index()
  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  survey: Relation<SurveyEntity>;

  /** `{ [문항id]: 값 }`. */
  @Column({ type: 'jsonb' })
  answers: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
