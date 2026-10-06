import type { DataSource, EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { FormStore } from '../form/form.store.js';
import { SurveyStore } from '../survey/survey.store.js';
import { ExpoPurgeService } from './expo-purge.service.js';

const expoId = '11111111-1111-1111-1111-111111111111';
const manager = { name: 'transaction-manager' } as unknown as EntityManager;

describe('ExpoPurgeService', () => {
  let dataSource: { transaction: Mock };
  let deletedExpoStore: { markDeleted: Mock };
  let formStore: { deleteByExpoId: Mock };
  let surveyStore: { deleteByExpoId: Mock };
  let service: ExpoPurgeService;

  beforeEach(() => {
    dataSource = {
      transaction: vi.fn(async (run: (m: EntityManager) => Promise<unknown>) =>
        run(manager),
      ),
    };
    deletedExpoStore = { markDeleted: vi.fn() };
    formStore = { deleteByExpoId: vi.fn().mockResolvedValue(2) };
    surveyStore = { deleteByExpoId: vi.fn().mockResolvedValue(1) };
    service = new ExpoPurgeService(
      dataSource as unknown as DataSource,
      deletedExpoStore as unknown as DeletedExpoStore,
      formStore as unknown as FormStore,
      surveyStore as unknown as SurveyStore,
    );
  });

  it('한 트랜잭션에서 삭제 기록, 폼, 설문 순서로 지운다', async () => {
    await service.purge(expoId);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(deletedExpoStore.markDeleted).toHaveBeenCalledWith(manager, expoId);
    expect(formStore.deleteByExpoId).toHaveBeenCalledWith(expoId, manager);
    expect(surveyStore.deleteByExpoId).toHaveBeenCalledWith(expoId, manager);

    const order = [
      deletedExpoStore.markDeleted,
      formStore.deleteByExpoId,
      surveyStore.deleteByExpoId,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it('지울 폼·설문이 없어도 성공한다', async () => {
    formStore.deleteByExpoId.mockResolvedValue(0);
    surveyStore.deleteByExpoId.mockResolvedValue(0);

    await expect(service.purge(expoId)).resolves.toBeUndefined();
  });

  it('중간에 실패하면 예외를 그대로 전파해 호출한 쪽이 다시 시도하게 한다', async () => {
    surveyStore.deleteByExpoId.mockRejectedValue(new Error('db down'));

    await expect(service.purge(expoId)).rejects.toThrow('db down');
  });
});
