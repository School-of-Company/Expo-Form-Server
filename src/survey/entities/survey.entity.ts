import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { DynamicSurveyEntity } from './dynamic-survey.entity.js';

/**
 * 하나의 박람회(expo)에서 특정 참여자군을 대상으로 노출되는 후기/피드백 설문 정의.
 * `form`(사전신청)과 달리 접수 기간 개념이 없고, 행사 종료 후 계속 열려 있는 응답 채널이다.
 * 실제 문항 목록은 {@link dynamicSurveys}로 별도 정규화되어 있다.
 */
@Entity('survey')
export class SurveyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 500 })
  informationText: string;

  /** 이 설문이 대상으로 하는 참여자군 (교육생 / 일반 참가자). */
  @Column({ type: 'enum', enum: ParticipationType })
  participationType: ParticipationType;

  /** 누적 응답 수. 응답이 생성될 때마다 증가시킨다. */
  @Column({ type: 'int', default: 0 })
  totalAnswers: number;

  /** 박람회(expo) 서비스가 소유한 리소스 — 서비스별 DB 분리 원칙에 따라 FK 없이 값으로만 보관한다. */
  @Index()
  @Column({ type: 'uuid' })
  expoId: string;

  /**
   * 이 설문을 구성하는 문항 정의 목록.
   * 문항 하나당 row 하나인 정규화 테이블 방식 — JSONB embed 전환은 TODO.local.md 참고.
   */
  @OneToMany(() => DynamicSurveyEntity, (dynamicSurvey) => dynamicSurvey.survey, {
    cascade: true,
  })
  dynamicSurveys: DynamicSurveyEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
