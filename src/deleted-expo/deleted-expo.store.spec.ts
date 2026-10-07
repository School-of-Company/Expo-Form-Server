import type { EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ExpoDeletedException } from '../common/exceptions/domain.exception.js';
import { DeletedExpoStore } from './deleted-expo.store.js';
import { DeletedExpoEntity } from './entities/deleted-expo.entity.js';

const expoId = '11111111-1111-1111-1111-111111111111';

describe('DeletedExpoStore', () => {
  let manager: {
    query: Mock;
    existsBy: Mock;
    createQueryBuilder: Mock;
  };
  let builder: Record<string, Mock>;
  let store: DeletedExpoStore;

  beforeEach(() => {
    builder = {
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      execute: vi.fn(),
    };
    manager = {
      query: vi.fn(),
      existsBy: vi.fn().mockResolvedValue(false),
      createQueryBuilder: vi.fn().mockReturnValue(builder),
    };
    store = new DeletedExpoStore();
  });

  describe('lockAndAssertNotDeleted', () => {
    it('박람회별 잠금을 건 뒤 삭제 기록이 없으면 통과한다', async () => {
      await expect(
        store.lockAndAssertNotDeleted(
          manager as unknown as EntityManager,
          expoId,
        ),
      ).resolves.toBeUndefined();

      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1::uuid::text))',
        [expoId],
      );
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.existsBy.mock.invocationCallOrder[0],
      );
    });

    it('삭제 기록이 있으면 거절한다', async () => {
      manager.existsBy.mockResolvedValue(true);

      await expect(
        store.lockAndAssertNotDeleted(
          manager as unknown as EntityManager,
          expoId,
        ),
      ).rejects.toThrow(ExpoDeletedException);
      expect(manager.existsBy).toHaveBeenCalledWith(DeletedExpoEntity, {
        expoId,
      });
    });
  });

  describe('markDeleted', () => {
    it('잠금을 건 뒤 삭제 기록을 남기고 이미 있어도 무시한다', async () => {
      await store.markDeleted(manager as unknown as EntityManager, expoId);

      expect(builder.into).toHaveBeenCalledWith(DeletedExpoEntity);
      expect(builder.values).toHaveBeenCalledWith({ expoId });
      expect(builder.orIgnore).toHaveBeenCalled();
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        builder.execute.mock.invocationCallOrder[0],
      );
    });
  });
});
