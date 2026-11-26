import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import type { DynamicSurveyQuestion } from '../dynamic-survey-question.js';

/**
 * 하나의 박람회(expo)에서 특정 참여자군을 대상으로 노출되는 후기/피드백 설문 정의.
 * `form`(사전신청)과 달리 접수 기간 개념이 없고, 행사 종료 후 계속 열려 있는 응답 채널이다.
 * 문항 목록은 {@link dynamicSurveys}(jsonb 배열)에 함께 담긴다.
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

  /**
   * 공개 링크 답변 수(옛 종이 QR 답변 포함). 로그인/SMS 답변은 접수 기록으로 따로 세므로, 설문의 응답 수는
   * 이 값만 보지 말고 `SurveyStore.countAnswers`로 읽는다.
   */
  @Column({ type: 'int', default: 0 })
  totalAnswers: number;

  /**
   * 경품 추첨을 켰는지. 박람회(설문)마다 따로 두며 기본은 꺼짐이다. 꺼져 있으면 공개 설문이 번호를 받지
   * 않고 추첨도 하지 않는다.
   */
  @Column({ type: 'boolean', default: false })
  lotteryEnabled: boolean;

  /**
   * 당첨 번호 목록. 공개 설문 응답자를 모두 센 순번({@link lotterySequence})이 이 목록에 있으면 그 응답이
   * 당첨이다. 박람회마다 관리자가 직접 정하고, 비어 있으면 추첨하지 않는다.
   */
  @Column({ type: 'int', array: true, default: () => "'{}'" })
  lotteryNumbers: number[];

  /** 추첨을 켜 둔 동안 공개 설문 응답자를 모두 센 순번(전화번호와 무관). 꺼져 있는 동안은 세지 않고, 다시 켜면 이어서 센다. */
  @Column({ type: 'int', default: 0 })
  lotterySequence: number;

  /** 박람회(expo) 서비스가 소유한 리소스 — 서비스별 DB 분리 원칙에 따라 FK 없이 값으로만 보관한다. */
  @Index()
  @Column({ type: 'uuid' })
  expoId: string;

  /**
   * 이 설문을 구성하는 문항 정의 목록. 컬럼 `questions`(jsonb 배열)에 담기고 배열 순서가 표시 순서다.
   * 문항 하나당 행 하나였던 `dynamic_survey` 테이블을 이 컬럼으로 옮겼다(옛 테이블은 롤백 대비로 한 릴리스 남겨 둔다).
   * 원소의 `id` 규칙은 {@link DynamicSurveyQuestion}.
   */
  @Column({ name: 'questions', type: 'jsonb' })
  dynamicSurveys: DynamicSurveyQuestion[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
