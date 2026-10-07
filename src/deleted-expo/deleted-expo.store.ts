import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ExpoDeletedException } from '../common/exceptions/domain.exception.js';
import { DeletedExpoEntity } from './entities/deleted-expo.entity.js';

/**
 * 삭제된 박람회 기록과, 같은 박람회에 대한 삭제·생성을 한 줄로 세우는 잠금을 다룬다.
 *
 * 두 메서드 모두 호출한 트랜잭션 안에서 박람회 ID별 어드바이저리 잠금을 건다(트랜잭션이 끝나면 풀린다).
 * 그래서 "삭제 기록이 없는 걸 확인하고 폼을 저장하는 사이에 삭제가 끝나 버리는" 경합이 없다 — 삭제가
 * 먼저면 생성이 기록을 보고 거절되고, 생성이 먼저면 삭제가 그 저장이 커밋되길 기다렸다가 새로 만들어진
 * 폼까지 함께 지운다.
 */
@Injectable()
export class DeletedExpoStore {
  /**
   * 이 박람회가 삭제되지 않았는지 확인한다. 폼·설문을 저장하는 트랜잭션 안에서 저장 직전에 부른다.
   *
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async lockAndAssertNotDeleted(
    manager: EntityManager,
    expoId: string,
  ): Promise<void> {
    await this.lock(manager, expoId);

    if (await manager.existsBy(DeletedExpoEntity, { expoId })) {
      throw new ExpoDeletedException();
    }
  }

  /** 박람회를 삭제됨으로 기록한다. 이미 기록돼 있어도 성공한다(다시 불러도 안전). */
  async markDeleted(manager: EntityManager, expoId: string): Promise<void> {
    await this.lock(manager, expoId);

    await manager
      .createQueryBuilder()
      .insert()
      .into(DeletedExpoEntity)
      .values({ expoId })
      .orIgnore()
      .execute();
  }

  /**
   * 해시가 같은 다른 박람회와 잠금을 나눌 수 있지만, 그 경우에도 잠깐 기다릴 뿐 동작은 같다.
   *
   * 키는 요청 문자열이 아니라 DB가 정규화한 UUID 문자열로 만든다. `ParseUUIDPipe`는 대문자 UUID도
   * 받는데, 같은 박람회를 대문자와 소문자로 부르면 `uuid` 컬럼은 같은 값으로 비교하면서 잠금 키만
   * 달라져 삭제와 생성이 서로 기다리지 않게 되기 때문이다.
   */
  private async lock(manager: EntityManager, expoId: string): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtext($1::uuid::text))',
      [expoId],
    );
  }
}
