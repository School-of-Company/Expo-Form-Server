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
 * 현장 등록자에게 나눠 주는 종이 QR 한 장. 응답자 정보가 전혀 없는 익명 응답이라, 추측할 수
 * 없는 토큰 자체가 "이 종이를 받았다"는 증명이 된다. 토큰 하나로 한 번만 응답할 수 있다.
 *
 * 사전 신청자(전화번호) 답변은 유저 서비스가 저장하지만, 이 경로는 묶을 사람이 없어서
 * 답변을 여기 직접 둔다. 사용 여부는 `submittedAt`으로만 판단한다.
 */
@Entity('survey_qr_token')
export class SurveyQrTokenEntity {
  @PrimaryColumn({ length: 32 })
  token: string;

  @Index()
  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  survey: Relation<SurveyEntity>;

  /** `{ [문항id]: 값 }`. 아직 응답 전이면 null. */
  @Column({ type: 'jsonb', nullable: true })
  answers: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
