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
 * 공개 설문 링크로 들어온 익명 설문 응답. 응답자 정보가 없어서 유저 서비스에 보낼 수 없고, 묶을 사람이
 * 없으니 답변을 이 서비스가 직접 저장한다 — "답변은 유저 서비스가 저장" 원칙의 유일한 예외다.
 *
 * 응답마다 생성한 `id`가 PK다. 같은 응답자가 여러 번 응답해도 막지 않는다.
 *
 * 테이블 이름(`survey_qr_answer`)과 `token` 컬럼은 현장 종이 QR로 응답을 받던 때의 흔적이다. 종이 QR 응답
 * 경로는 없어졌고 새 응답의 `token`은 항상 null이다. 그때 받은 응답은 토큰이 남은 채로 보존된다.
 */
@Entity('survey_qr_answer')
@Index(['surveyId', 'token'], { unique: true, where: '"token" IS NOT NULL' })
export class SurveyQrAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  surveyId: string;

  /** 종이 QR 시절 응답의 토큰. 공개 링크 응답은 null이다. */
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
