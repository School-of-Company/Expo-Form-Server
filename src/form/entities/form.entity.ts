import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationType } from './application-type.enum.js';
import { DynamicFormEntity } from './dynamic-form.entity.js';
import { ParticipationType } from './participation-type.enum.js';

@Entity('form')
export class FormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 500 })
  informationText: string;

  @Column({ type: 'enum', enum: ParticipationType })
  participationType: ParticipationType;

  @Column({ type: 'enum', enum: ApplicationType })
  applicationType: ApplicationType;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  // 박람회(expo) 서비스가 소유한 리소스 — 서비스별 DB 분리 원칙에 따라 FK 없이 값으로만 보관한다.
  @Index()
  @Column({ type: 'uuid' })
  expoId: string;

  @OneToMany(() => DynamicFormEntity, (dynamicForm) => dynamicForm.form, {
    cascade: true,
  })
  dynamicForms: DynamicFormEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
