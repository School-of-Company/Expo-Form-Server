import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * 삭제된 박람회의 기록. 박람회가 삭제되면 그 박람회의 폼·설문은 모두 지워지는데, 기록이 없으면 삭제 직후
 * 같은 박람회 ID로 폼·설문을 다시 만들 수 있어서(삭제와 생성이 겹치면 더더욱) 지워졌어야 할 데이터가
 * 되살아난다. 이 기록이 있는 박람회에는 새 폼·설문을 만들 수 없다.
 *
 * 박람회 ID는 UUID라 다시 쓰이지 않으므로 기록은 지우지 않는다.
 */
@Entity('deleted_expo')
export class DeletedExpoEntity {
  /** 박람회(expo) 서비스가 소유한 ID — FK 없이 값으로만 보관한다. */
  @PrimaryColumn({ type: 'uuid' })
  expoId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  deletedAt: Date;
}
