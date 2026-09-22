import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { DynamicFormFieldType } from '../../json/dynamic-form-field-type.enum.js';
import { SurveyEntity } from './survey.entity.js';

/**
 * {@link SurveyEntity}에 속한 문항 하나. 실제 문항 값 스펙(선택지, 검증 규칙 등)은
 * `json` 모듈이 별도로 다루며, 이 엔티티는 문항의 메타데이터만 가진다.
 */
@Entity('dynamic_survey')
export class DynamicSurveyEntity {
  /** 항상 부모 {@link SurveyEntity}를 통해서만 접근되고 외부 서비스가 참조하지 않아 auto-increment로 충분하다. */
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  title: string;

  /** 입력 위젯 종류 (문장형/체크박스/드롭다운/이미지/다중선택). `form`과 동일한 위젯 개념을 공유한다. */
  @Column({ type: 'enum', enum: DynamicFormFieldType })
  formType: DynamicFormFieldType;

  /** 응답자가 값을 채우지 않으면 제출을 막을지 여부. */
  @Column({ type: 'boolean' })
  requiredStatus: boolean;

  @Index()
  @ManyToOne(() => SurveyEntity, (survey) => survey.dynamicSurveys, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  survey: Relation<SurveyEntity>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
