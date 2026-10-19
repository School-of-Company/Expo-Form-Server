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
import { FormPurpose } from './form-purpose.enum.js';

/**
 * 하나의 박람회(expo)에서 특정 참여자군 x 신청 방식 조합에 대해 노출되는
 * 신청서 정의. 실제 입력 필드 목록은 {@link dynamicForms}로 별도 정규화되어 있다.
 *
 * 등록용 폼은 `(expoId, participationType, applicationType)`이 폼을 유일하게 식별하는 조합이라
 * DB 유니크 제약으로 막는다 — 애플리케이션 레벨 중복 검사만으로는 동시 요청을 걸러내지 못한다.
 * 이 제약은 등록용에만 걸린다(부분 인덱스). 프로그램용은 같은 유형이어도 여러 개 만들 수 있고, 대신 같은
 * 박람회 안에서 제목이 겹치지 않아야 한다(아래 두 번째 부분 인덱스).
 */
@Index(['expoId', 'participationType', 'applicationType'], {
  unique: true,
  where: `"purpose" = 'REGISTRATION'`,
})
@Index(['expoId', 'title'], {
  unique: true,
  where: `"purpose" = 'PROGRAM'`,
})
@Entity('form')
export class FormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 폼의 용도. 기존 폼과 기존 API는 모두 등록용이다. */
  @Column({
    type: 'enum',
    enum: FormPurpose,
    default: FormPurpose.REGISTRATION,
  })
  purpose: FormPurpose;

  /**
   * 폼 정의를 바꿀 때마다 1씩 올라가는 버전. 관리자가 같은 폼을 동시에 고치거나, 작성 중에 폼이 바뀐 것을
   * 구분하는 데 쓴다. 새 폼은 1에서 시작한다.
   */
  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 500 })
  informationText: string;

  /**
   * 이 폼이 대상으로 하는 참여자군 (교육생 / 일반 참가자). 등록용 폼은 항상 값이 있다. 프로그램용 폼은 null일 수
   * 있다 — 프로그램의 대상 역할은 박람회 서비스 회차의 `allowedOccupations`가 정하기 때문이다.
   */
  @Column({ type: 'enum', enum: ParticipationType, nullable: true })
  participationType: ParticipationType | null;

  /**
   * 사전 등록(PRE)인지 현장 등록(FIELD)인지 — 같은 expo·참여자군이어도 신청 방식별로 폼이 갈린다.
   * 신청 방식이 없는 프로그램용 폼은 null이다. 등록용 폼은 항상 값이 있다.
   */
  @Column({ type: 'enum', enum: ApplicationType, nullable: true })
  applicationType: ApplicationType | null;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  /**
   * 교원(`TEACHER`)·예비교사(`PRE_SERVICE_TEACHER`) 외 직업의 사전등록 시작 시각. 그 전에는 교원·예비교사만
   * 신청할 수 있다(검사는 신청 서비스가 한다). null이면 직업에 따른 제한이 없다. 값이 있으면 접수 기간 안에 있다.
   */
  @Column({ type: 'timestamptz', nullable: true })
  occupationOpenAt: Date | null;

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
