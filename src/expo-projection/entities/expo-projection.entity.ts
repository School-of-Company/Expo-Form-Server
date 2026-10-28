import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * 박람회 서비스가 `expo.expo.changed`로 보낸 박람회 상태 중 이 서비스가 읽는 값만 담은 로컬 사본.
 *
 * 폼·설문 생성의 존재 확인과 당첨 번호 보관 기간 계산이 박람회 기간만 보므로 기간만 둔다. 프로그램·회차는
 * 읽지 않아 저장하지 않는다. 박람회가 지워지면(tombstone) 이 행을 지우고, 마지막 반영 버전은
 * {@link ExpoProjectionVersionEntity}에 남긴다.
 */
@Entity('expo_projection')
export class ExpoProjectionEntity {
  /** 박람회(expo) 서비스가 소유한 ID — FK 없이 값으로만 보관한다. */
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_expo_projection',
  })
  expoId: string;

  /** 박람회 시작일(한국 시간 기준 `yyyy-MM-dd`). */
  @Column({ type: 'date' })
  startedDay: string;

  /** 박람회 종료일(한국 시간 기준 `yyyy-MM-dd`). */
  @Column({ type: 'date' })
  finishedDay: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
