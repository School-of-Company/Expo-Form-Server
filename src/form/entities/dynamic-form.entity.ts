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
import { DynamicFormType } from './dynamic-form-type.enum.js';
import { FormType } from './form-type.enum.js';
import { FormEntity } from './form.entity.js';

@Entity('dynamic_form')
export class DynamicFormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  @Column({ name: 'form_type', type: 'enum', enum: FormType })
  formType: FormType;

  @Column({ name: 'required_status', type: 'boolean' })
  requiredStatus: boolean;

  @Column({
    name: 'dynamic_form_type',
    type: 'enum',
    enum: DynamicFormType,
  })
  dynamicFormType: DynamicFormType;

  @Index()
  @ManyToOne(() => FormEntity, (form) => form.dynamicForms, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'form_id' })
  form: FormEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
