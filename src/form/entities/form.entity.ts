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
import { ApplicationType } from './application-type.enum.js';
import { DynamicFormEntity } from './dynamic-form.entity.js';

/**
 * 하나의 박람회(expo)에서 특정 참여자군 x 신청 방식 조합에 대해 노출되는
 * 신청서 정의. 실제 입력 필드 목록은 {@link dynamicForms}로 별도 정규화되어 있다.
 *
 * `(expoId, participationType, applicationType)`은 폼을 유일하게 식별하는 조합이라
 * DB 유니크 제약으로 막는다 — 애플리케이션 레벨 중복 검사만으로는 동시 요청을 걸러내지 못한다.
 */
@Index(['expoId', 'participationType', 'applicationType'], { unique: true })
@Entity('form')
export class FormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 500 })
  informationText: string;

  /** 이 폼이 대상으로 하는 참여자군 (교육생 / 일반 참가자). */
  @Column({ type: 'enum', enum: ParticipationType })
  participationType: ParticipationType;

  /** 사전 등록(PRE)인지 현장 등록(FIELD)인지 — 같은 expo·참여자군이어도 신청 방식별로 폼이 갈린다. */
  @Column({ type: 'enum', enum: ApplicationType })
  applicationType: ApplicationType;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  /** 박람회(expo) 서비스가 소유한 리소스 — 서비스별 DB 분리 원칙에 따라 FK 없이 값으로만 보관한다. */
  @Index()
  @Column({ type: 'uuid' })
  expoId: string;

  /**
   * 이 폼을 구성하는 입력 필드 정의 목록.
   * 필드 하나당 row 하나인 정규화 테이블 방식 — JSONB embed 전환은 TODO.local.md 참고.
   */
  @OneToMany(() => DynamicFormEntity, (dynamicForm) => dynamicForm.form, {
    cascade: true,
  })
  dynamicForms: DynamicFormEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
