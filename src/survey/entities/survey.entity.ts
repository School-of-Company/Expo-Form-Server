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
import { DynamicSurveyEntity } from './dynamic-survey.entity.js';

/**
 * 하나의 박람회(expo)에서 특정 참여자군을 대상으로 노출되는 후기/피드백 설문 정의.
 * `form`(사전신청)과 달리 접수 기간 개념이 없고, 행사 종료 후 계속 열려 있는 응답 채널이다.
 * 실제 문항 목록은 {@link dynamicSurveys}로 별도 정규화되어 있다.
 *
 * `(expoId, participationType)`은 설문을 유일하게 식별하는 조합이라 DB 유니크 제약으로 막는다 —
 * 애플리케이션 레벨 중복 검사만으로는 동시에 들어온 생성 요청을 걸러내지 못한다.
 */
@Index(['expoId', 'participationType'], { unique: true })
@Entity('survey')
export class SurveyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 500 })
  informationText: string;

  /** 이 설문이 대상으로 하는 참여자군 (교육생 / 일반 참가자). */
  @Column({ type: 'enum', enum: ParticipationType })
  participationType: ParticipationType;

  /** 누적 응답 수. 응답이 생성될 때마다 증가시킨다. */
  @Column({ type: 'int', default: 0 })
  totalAnswers: number;

  /**
   * 경품 추첨을 켰는지. 박람회(설문)마다 따로 두며 기본은 꺼짐이다. 꺼져 있으면 공개 설문이 번호를 받지
   * 않고 추첨도 하지 않는다.
   */
  @Column({ type: 'boolean', default: false })
  lotteryEnabled: boolean;

  /**
   * 당첨 번호 목록. 번호를 입력한 응답자만 센 순번({@link lotterySequence})이 이 목록에 있으면 그 응답이
   * 당첨이다. 박람회마다 관리자가 직접 정하고, 비어 있으면 추첨하지 않는다.
   */
  @Column({ type: 'int', array: true, default: () => "'{}'" })
  lotteryNumbers: number[];

  /** 추첨을 켜 둔 동안 번호를 입력한 응답자를 센 순번. 꺼져 있는 동안은 세지 않고, 다시 켜면 이어서 센다. */
  @Column({ type: 'int', default: 0 })
  lotterySequence: number;

  /** 박람회(expo) 서비스가 소유한 리소스 — 서비스별 DB 분리 원칙에 따라 FK 없이 값으로만 보관한다. */
  @Index()
  @Column({ type: 'uuid' })
  expoId: string;

  /**
   * 이 설문을 구성하는 문항 정의 목록.
   * 문항 하나당 row 하나인 정규화 테이블 방식 — JSONB embed 전환은 TODO.local.md 참고.
   */
  @OneToMany(
    () => DynamicSurveyEntity,
    (dynamicSurvey) => dynamicSurvey.survey,
    {
      cascade: true,
    },
  )
  dynamicSurveys: DynamicSurveyEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
