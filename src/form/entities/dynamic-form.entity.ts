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
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import { DynamicFormType } from './dynamic-form-type.enum.js';
import { FormEntity } from './form.entity.js';

/**
 * {@link FormEntity}에 속한 입력 필드 하나. 선택지·검증 규칙 같은 값 스펙은 아직 이 엔티티에
 * 없고, 지금은 필드의 메타데이터(제목, 위젯 종류, 필수 여부)만 가진다.
 */
@Entity('dynamic_form')
export class DynamicFormEntity {
  /** 항상 부모 {@link FormEntity}를 통해서만 접근되고 외부 서비스가 참조하지 않아 auto-increment로 충분하다. */
  @PrimaryGeneratedColumn()
  id: number;

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
