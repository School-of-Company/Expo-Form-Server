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
import { DynamicFormFieldType } from './dynamic-form-field-type.enum.js';
import { DynamicFormType } from './dynamic-form-type.enum.js';
import { FormEntity } from './form.entity.js';

/**
 * {@link FormEntity}에 속한 입력 필드 하나. 실제 필드 값 스펙(선택지, 검증 규칙 등)은
 * `json` 모듈이 별도로 다루며, 이 엔티티는 필드의 메타데이터만 가진다.
 */
@Entity('dynamic_form')
export class DynamicFormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  /** 입력 위젯 종류 (문장형/체크박스/드롭다운/이미지/다중선택). */
  @Column({ type: 'enum', enum: DynamicFormFieldType })
  formType: DynamicFormFieldType;

  /** 신청자가 값을 채우지 않으면 제출을 막을지 여부. */
  @Column({ type: 'boolean' })
  requiredStatus: boolean;

  /**
   * 다른 서비스가 소비하는 고정 의미를 가진 필드인지 표시.
   * NAME/PHONE_NUMBER/TRAINING_ID는 신청 처리 로직이 값을 직접 참조하는 필드이고,
   * DEFAULT는 폼 작성자가 자유롭게 정의한 커스텀 필드다.
   */
  @Column({ type: 'enum', enum: DynamicFormType })
  dynamicFormType: DynamicFormType;

  @Index()
  @ManyToOne(() => FormEntity, (form) => form.dynamicForms, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  form: Relation<FormEntity>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
