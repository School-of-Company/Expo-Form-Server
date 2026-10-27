import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ExpoProjectionStore } from '../expo-projection/expo-projection.store.js';
import type { ExpoClient } from './expo-client.interface.js';
import { ProjectedExpoClient } from './projected-expo-client.js';

const expoId = '11111111-1111-4111-8111-111111111111';
const period = { startedDay: '2026-10-10', finishedDay: '2026-10-12' };

describe('ProjectedExpoClient', () => {
  let store: { find: Mock };
  let delegate: {
    exists: Mock;
    findPeriod: Mock;
    reserveProgramFormUpdate: Mock;
    releaseProgramFormChange: Mock;
  };
  let client: ProjectedExpoClient;

  beforeEach(() => {
    store = { find: vi.fn() };
    delegate = {
      exists: vi.fn(),
      findPeriod: vi.fn(),
      reserveProgramFormUpdate: vi.fn(),
      releaseProgramFormChange: vi.fn(),
    };
    client = new ProjectedExpoClient(
      delegate,
      store as unknown as ExpoProjectionStore,
    );
  });

  it('프로젝션에 있으면 박람회 서비스를 부르지 않고 프로젝션으로 답한다', async () => {
    store.find.mockResolvedValue({ state: 'present', period });

    await expect(client.exists(expoId)).resolves.toBe(true);
    await expect(client.findPeriod(expoId)).resolves.toEqual(period);
    expect(delegate.exists).not.toHaveBeenCalled();
    expect(delegate.findPeriod).not.toHaveBeenCalled();
  });

  it('tombstone을 받은 박람회는 박람회 서비스의 404처럼 없음으로 답한다', async () => {
    store.find.mockResolvedValue({ state: 'deleted' });

    await expect(client.exists(expoId)).resolves.toBe(false);
    await expect(client.findPeriod(expoId)).resolves.toBeNull();
    expect(delegate.exists).not.toHaveBeenCalled();
    expect(delegate.findPeriod).not.toHaveBeenCalled();
  });

  it('프로젝션에 없으면 동기 조회로 넘기고, 미스 로그는 박람회마다 한 번만 남긴다', async () => {
    store.find.mockResolvedValue({ state: 'miss' });
    delegate.exists.mockResolvedValue(true);
    delegate.findPeriod.mockResolvedValue(period);
    const log = vi
      .spyOn(
        (client as unknown as { logger: { log: () => void } }).logger,
        'log',
      )
      .mockImplementation(() => undefined);

    await expect(client.exists(expoId)).resolves.toBe(true);
    await expect(client.findPeriod(expoId)).resolves.toEqual(period);
    await client.exists(expoId);

    expect(delegate.exists).toHaveBeenCalledWith(expoId);
    expect(delegate.findPeriod).toHaveBeenCalledWith(expoId);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('동기 조회의 장애는 그대로 던진다(회로 차단기 동작 유지)', async () => {
    store.find.mockResolvedValue({ state: 'miss' });
    const failure = new Error('circuit open');
    delegate.findPeriod.mockRejectedValue(failure);

    await expect(client.findPeriod(expoId)).rejects.toBe(failure);
  });

  it('폼 변경 예약·해제는 프로젝션을 보지 않고 박람회 서비스로 보낸다', async () => {
    await client.reserveProgramFormUpdate('form-1', 'change-1');
    await client.releaseProgramFormChange('form-1', 'change-1');

    expect(delegate.reserveProgramFormUpdate).toHaveBeenCalledWith(
      'form-1',
      'change-1',
    );
    expect(delegate.releaseProgramFormChange).toHaveBeenCalledWith(
      'form-1',
      'change-1',
    );
    expect(store.find).not.toHaveBeenCalled();
  });
});
