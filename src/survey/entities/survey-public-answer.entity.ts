import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Occupation } from '../../common/enums/occupation.enum.js';
import { SurveyEntity } from './survey.entity.js';

/**
 * 공개 설문 링크로 들어온 익명 설문 응답. 응답자 정보가 없어서 유저 서비스에 보낼 수 없고, 묶을 사람이
 * 없으니 답변을 이 서비스가 직접 저장한다 — "답변은 유저 서비스가 저장" 원칙의 유일한 예외다.
 *
 * 응답마다 생성한 `id`가 PK다. 같은 응답자가 여러 번 응답해도 막지 않는다.
 *
 * 현장 종이 QR로 응답을 받던 옛 테이블(`survey_qr_answer`)과는 별개다. 종이 QR 경로는 없어졌고 그 테이블은
 * 더 이상 쓰지 않는다(엔티티도 없다). 기본 키가 `(survey_id, token)`이라 공개 응답을 담으려고 바꾸면 개발
 * 서버의 자동 스키마 반영(`synchronize`)이 실패해서, 이름이 다른 새 테이블을 만들었다.
 */
@Entity('survey_public_answer')
export class SurveyPublicAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  /** `{ [문항id]: 값 }`. */
  @Column({ type: 'jsonb' })
  answers: Record<string, unknown>;

  /** 응답자가 고른 직업. 익명 응답을 직업별(초등학생·교사 등)로 나눠 보려고 문항이 아닌 컬럼으로 둔다. */
  @Column({ type: 'enum', enum: Occupation })
  occupation: Occupation;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
