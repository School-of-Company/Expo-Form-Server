import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { SurveyEntity } from './survey.entity.js';

/** 정규화한 전화번호(`01XXXXXXXXX`)의 최대 길이. */
export const LOTTERY_PHONE_MAX_LENGTH = 11;

/**
 * 경품 당첨 기록이자 알림 서비스로 보내는 아웃박스 레코드.
 *
 * 당첨 판정과 같은 트랜잭션에서 저장한다. 번호를 입력한 응답이 당첨되면 실제 Kafka 발행은 별도 릴레이가
 * 맡는다 — DB 커밋과 발행을 한 트랜잭션으로 묶을 수 없어서 커밋은 여기서 끝내고 발행을 뒤로 미룬다.
 * `eventId`는 한 번 만들고 재발행에도 그대로 쓴다 — 알림 서비스가 이 값을 멱등키로 문자를 한 번만 보내기
 * 때문이다. 번호 없이 당첨된 응답도 기록은 남기고 문자는 보내지 않는다(`phoneNumber`가 null).
 *
 * 같은 설문에서 같은 당첨 순번은 한 번만 만들어진다(`(surveyId, drawNumber)` 유니크). 전화번호는 개인정보라
 * 당첨된 응답의 것만 저장하고, 박람회가 끝난 뒤 보관 기간(`LOTTERY_PHONE_RETENTION_DAYS`, 기본 30일)이 지나면
 * `LotteryPhoneRetentionService`가 번호만 지운다. 당첨 순번과 발행 기록은 남는다.
 */
@Index(['surveyId', 'drawNumber'], { unique: true })
/** 아직 발행하지 않은 당첨 결과만 담는 부분 인덱스. 릴레이와 지표가 발행 대기 건을 찾을 때 쓴다. */
@Index('IX_survey_draw_result_unpublished', ['createdAt'], {
  where: `"published_at" IS NULL`,
})
@Entity('survey_draw_result')
export class SurveyDrawResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 발행 멱등키. 결과를 만들 때 DB가 채운다(`uuid_generate_v4()`). */
  @Column({ type: 'uuid', unique: true })
  eventId: string;

  @Column({ type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => SurveyEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Relation<SurveyEntity>;

  /** 당첨된 순번. 문자에 "N번!"으로 들어간다. */
  @Column({ type: 'int' })
  drawNumber: number;

  /** 당첨된 응답자가 입력한 번호. 번호 없이 당첨됐으면 null이고 문자를 보내지 않는다. */
  @Column({ type: 'varchar', length: LOTTERY_PHONE_MAX_LENGTH, nullable: true })
  phoneNumber: string | null;

  /** 발행에 성공한 시각. 비어 있으면 아직 발행하지 않은 것이다. */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /**
   * 발행에 실패한 횟수. 상한(`SURVEY_DRAW_RESULT_MAX_RETRY_COUNT`)에 닿으면 릴레이가 더 보내지 않고 사람이 볼
   * 대상으로 남긴다 — 계속 실패하는 건이 배치 앞을 차지해 정상 건 발행을 밀어내지 않게 하려는 것이다.
   */
  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
