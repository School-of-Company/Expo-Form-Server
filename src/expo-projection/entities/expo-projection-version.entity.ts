import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * 박람회마다 마지막으로 반영한 `expo.expo.changed` 이벤트. 이 버전 이하의 이벤트는 버린다(중복·순서 뒤바뀜).
 *
 * tombstone으로 {@link ExpoProjectionEntity} 행을 지운 뒤에도 남겨, 늦게 도착한 옛 이벤트가 지워진
 * 박람회를 되살리지 못하게 한다. 이 행이 없으면 아직 이벤트를 받은 적 없는 박람회(프로젝션 미스)다.
 */
@Entity('expo_projection_version')
export class ExpoProjectionVersionEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_expo_projection_version',
  })
  expoId: string;

  /** 박람회 서비스 아웃박스의 sequence. 박람회 안에서 커밋 순서와 같다. */
  @Column({ type: 'bigint' })
  version: string;

  @Column({ type: 'uuid' })
  eventId: string;

  /** 마지막으로 반영한 이벤트가 tombstone이었는지. */
  @Column({ type: 'boolean' })
  deleted: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  appliedAt: Date;
}
