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
import { Occupation } from '../../common/enums/occupation.enum.js';
import { SurveyEntity } from './survey.entity.js';

/** 참여 서비스가 정하는 토큰 형식에 맞춰 여유를 둔 최대 길이. 컬럼 길이와 경로 검증이 함께 쓴다. */
export const QR_TOKEN_MAX_LENGTH = 64;

/**
 * 익명 설문 응답. 현장 종이 QR로 들어온 응답과 공개 링크로 들어온 응답을 함께 담는다. 응답자 정보가
 * 없어서 유저 서비스에 보낼 수 없고, 묶을 사람이 없으니 답변을 이 서비스가 직접 저장한다 — "답변은
 * 유저 서비스가 저장" 원칙의 유일한 예외다.
 *
 * 응답마다 생성한 `id`가 PK다. 종이 QR 응답은 토큰을 함께 저장하고, 공개 링크 응답은 토큰이 없다(null).
 * 토큰은 참여 서비스가 발급·소유하고 이 서비스는 발급하지 않는다. 같은 설문에서 같은 토큰으로 두 번
 * 응답하면 `(surveyId, token)` 유니크 인덱스가 INSERT를 막는다 — 참여 서비스가 박람회마다 같은 토큰을
 * 다시 쓰더라도 서로 막지 않는다. 토큰이 null인 공개 응답은 이 인덱스에서 빠져 여러 번 응답할 수 있다.
 */
@Entity('survey_qr_answer')
@Index(['surveyId', 'token'], { unique: true, where: '"token" IS NOT NULL' })
export class SurveyQrAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  surveyId: string;

  /** 종이 QR 응답의 토큰. 공개 링크 응답은 null이다. */
  @Column({ type: 'varchar', length: QR_TOKEN_MAX_LENGTH, nullable: true })
  token: string | null;

  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  /** `{ [문항id]: 값 }`. */
  @Column({ type: 'jsonb' })
  answers: Record<string, unknown>;

  /**
   * 응답자가 고른 직업. 익명 응답을 직업별(초등학생·교사 등)로 나눠 보려고 문항이 아닌 컬럼으로 둔다.
   * 이 컬럼이 생기기 전 응답은 null이다.
   */
  @Column({ type: 'enum', enum: Occupation, nullable: true })
  occupation: Occupation | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
