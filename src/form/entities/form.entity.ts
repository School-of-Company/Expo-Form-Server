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

  @Column({ name: 'information_text', length: 500 })
  informationText: string;

  @Column({
    name: 'participation_type',
    type: 'enum',
    enum: ParticipationType,
  })
  participationType: ParticipationType;

  @Column({ name: 'application_type', type: 'enum', enum: ApplicationType })
  applicationType: ApplicationType;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  // 박람회(expo) 서비스가 소유한 리소스 — 서비스별 DB 분리 원칙에 따라 FK 없이 값으로만 보관한다.
  @Index()
  @Column({ name: 'expo_id', type: 'uuid' })
  expoId: string;

  @OneToMany(() => DynamicFormEntity, (dynamicForm) => dynamicForm.form, {
    cascade: true,
  })
  dynamicForms: DynamicFormEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
