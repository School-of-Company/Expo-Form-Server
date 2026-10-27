import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { SurveyPublicAnswerEntity } from './survey-public-answer.entity.js';

/**
 * 공개 설문 응답 하나에 딸린 기념품 수령 기록. 응답이 저장될 때 같은 트랜잭션에서 만들어지고, 응답당 하나뿐이다.
 * 제출자에게만 돌려준 비밀 토큰의 SHA-256 해시로만 찾을 수 있어서, 순번이나 공개 응답 id만으로는 조회·완료할 수 없다.
 *
 * 응답이나 설문이 지워지면 함께 지워진다. 설문 문항·응답 테이블은 건드리지 않는다.
 */
@Entity('survey_gift_claim')
export class SurveyGiftClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 박람회가 다른 토큰·PIN을 섞어 쓰지 못하게 조회 조건으로 쓰려고 응답의 설문 id를 그대로 둔다. */
  @Column({ type: 'uuid' })
  surveyId: string;

  @OneToOne(() => SurveyPublicAnswerEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'answer_id' })
  answer: Relation<SurveyPublicAnswerEntity>;

  @Column({ type: 'uuid', unique: true })
  answerId: string;

  /** 토큰 SHA-256의 hex. 토큰이 32바이트 난수라 솔트 없는 해시로 충분하다. */
  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  /** 직원 확인으로 수령이 끝난 시각. 비어 있으면 미수령이다. */
  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  /** 이 토큰에서 연속으로 틀린 PIN 횟수. 토큰 단위라 한 참가자의 오입력이 행사 전체를 막지 않는다. */
  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
