import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import type { QuestionSnapshot } from '../question-snapshot.js';
import { SurveyAnswerSubmissionStatus } from './survey-answer-submission-status.enum.js';

/**
 * 설문 답변 접수를 비동기(Kafka) 처리로 전환하면서 생긴 아웃박스 레코드.
 *
 * `submit()`은 이 row를 `RECEIVED`로 저장하고 끝난다 — 실제 Kafka 발행은 별도 릴레이가
 * 담당한다(DB 커밋과 Kafka 발행을 한 트랜잭션으로 묶을 수 없어서, 커밋 자체는 여기서 끝내고
 * 발행을 뒤로 미룬다). `eventId`는 최초 발행 시 한 번만 만들고, 이후 재발행에도 그대로
 * 재사용한다 — 유저 서비스가 이 값을 멱등키로 쓸 수 있어야 하기 때문이다.
 *
 * `(surveyId, phoneNumber)`는 "활성" 제출 하나만 유일해야 한다. `REJECTED`는 활성 제출이
 * 아니므로 유니크 제약에서 제외한다 — 그래야 거절된 응답자가 번호를 다시 등록한 뒤 재제출할 때
 * 기존 거절 기록이 재제출을 막지 않는다. 거절 기록은 감사 이력으로 그대로 남긴다.
 */
@Index(['surveyId', 'phoneNumber'], {
  unique: true,
  where: `status <> '${SurveyAnswerSubmissionStatus.REJECTED}'`,
})
@Entity('survey_answer_submission')
export class SurveyAnswerSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  surveyId: string;

  /** 박람회(expo) 서비스가 소유한 리소스 — 유저 서비스가 응답자를 조회할 때 필요하다. */
  @Column({ type: 'uuid' })
  expoId: string;

  /** 이 제출이 속한 참여자군. 유저 서비스가 어느 답변 테이블에 저장할지 판단하는 데 쓴다. */
  @Column({ type: 'enum', enum: ParticipationType })
  participationType: ParticipationType;

  /** {@link normalizePhoneNumber}로 정규화된 값만 저장한다. */
  @Column({ length: 20 })
  phoneNumber: string;

  /**
   * Kafka 메시지의 멱등키. 최초 발행 시 한 번 발급하고, 재발행 때도 바꾸지 않는다 —
   * 유저 서비스가 이미 처리한 eventId를 구분해서 재처리를 막을 수 있게 하기 위해서다.
   */
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'enum', enum: SurveyAnswerSubmissionStatus })
  status: SurveyAnswerSubmissionStatus;

  /** 거절 사유. `REJECTED`가 아니면 null. */
  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  /** 재발행 횟수. 릴레이가 무한정 재발행하지 않도록 상한을 두는 데 쓴다. */
  @Column({ type: 'int', default: 0 })
  retryCount: number;

  /** 마지막으로 발행(또는 재발행)한 시각. 릴레이가 "오래 머문 PUBLISHED"를 판단하는 기준. */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /**
   * 처음 발행한 이벤트의 버전. 같은 `eventId`는 재발행해도 같은 내용이어야 한다 — 유저 서비스는 처음
   * 처리한 이벤트만 반영하고 같은 `eventId`는 중복으로 무시하므로, 설정이 바뀐 뒤 다른 버전으로 다시
   * 보내면 새 내용(스냅샷)이 영영 전달되지 않는다. 그래서 한 번 정해지면 이 버전으로만 재발행한다.
   * 한 번도 발행하지 않았으면 null이다.
   */
  @Column({ type: 'smallint', nullable: true })
  eventVersion: number | null;

  /**
   * 검증까지 끝난 제출 내용(`answers`, `personalInformationStatus`)과 제출 당시의 문항 정의
   * (`questions`)를 그대로 보관한다. Kafka로 발행할 페이로드이자, 재발행 시 다시 읽어오는 원본이다.
   * 설문을 수정해도 이 값은 바뀌지 않아서, 옛 접수 건을 재발행해도 제출 당시의 문항이 나간다.
   *
   * `questions`는 스냅샷을 저장하기 전에 접수된 건에는 없다.
   */
  @Column({ type: 'jsonb' })
  payload: {
    answers: Record<string, unknown>;
    personalInformationStatus: boolean;
    questions?: QuestionSnapshot[];
  };

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
