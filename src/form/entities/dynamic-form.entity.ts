import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DynamicFormFieldType } from './dynamic-form-field-type.enum.js';
import { DynamicFormType } from './dynamic-form-type.enum.js';
import { FormEntity } from './form.entity.js';

@Entity('dynamic_form')
export class DynamicFormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  @Column({ type: 'enum', enum: DynamicFormFieldType })
  formType: DynamicFormFieldType;

  @Column({ type: 'boolean' })
  requiredStatus: boolean;

  @Column({ type: 'enum', enum: DynamicFormType })
  dynamicFormType: DynamicFormType;

  @Index()
  @ManyToOne(() => FormEntity, (form) => form.dynamicForms, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  form: FormEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
