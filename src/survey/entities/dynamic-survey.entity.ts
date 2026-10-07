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
import type { JsonData, OtherJson } from '../../json/field-spec.schema.js';
import { SurveyEntity } from './survey.entity.js';

/**
 * {@link SurveyEntity}에 속한 문항 하나.
 * 선택지(`jsonData`)와 부가 설정(`otherJson`)은 `json` 모듈의 스펙 스키마를 `form`과 공유한다 —
 * 설문 문항과 폼 필드는 같은 위젯 위에서 같은 값 스펙을 쓴다.
 *
 * 다만 `form`의 `dynamicFormType`에 해당하는 값은 없다. 그건 신청 처리 로직이 값을 직접
 * 참조하는 필드(이름/전화번호/연수원id)를 표시하는 용도인데, 설문 응답은 그 파이프라인에
 * 들어가지 않는다.
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

  /** 드롭다운·체크박스 등의 선택지 목록. */
  @Column({ type: 'jsonb' })
  jsonData: JsonData;

  /** 기타 입력 허용·최대 선택 개수·조건부 표시 같은 부가 설정. 없으면 null. */
  @Column({ type: 'jsonb', nullable: true })
  otherJson: OtherJson | null;

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
