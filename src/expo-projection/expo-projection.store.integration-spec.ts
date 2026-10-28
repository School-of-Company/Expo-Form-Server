import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { namingStrategy } from '../database/database.config.js';
import { ExpoProjectionVersionEntity } from './entities/expo-projection-version.entity.js';
import { ExpoProjectionEntity } from './entities/expo-projection.entity.js';
import type { ExpoChangedEvent } from './expo-changed-event.js';
import { ExpoProjectionStore } from './expo-projection.store.js';

/**
 * 박람회 프로젝션의 버전 비교·tombstone이 실제 PostgreSQL에서 맞게 도는지 확인한다. `DATABASE_URL`의 서버에
 * 임시 DB를 만들고 끝나면 지운다. 실행: `DATABASE_URL=... pnpm test:integration`
 */
const adminUrl = process.env.DATABASE_URL;

function changed(
  expoId: string,
  version: number,
  finishedDay = '2030-01-02',
): ExpoChangedEvent {
  return {
    eventId: randomUUID(),
    version,
    expoId,
    deleted: false,
    period: { startedDay: '2030-01-01', finishedDay },
  };
}

function tombstone(expoId: string, version: number): ExpoChangedEvent {
  return { eventId: randomUUID(), version, expoId, deleted: true };
}

describe.skipIf(adminUrl === undefined)('박람회 프로젝션 / PostgreSQL', () => {
  const dbName = `expo_projection_${randomUUID().replaceAll('-', '')}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let store: ExpoProjectionStore;

  beforeAll(async () => {
    if (adminUrl === undefined) {
      throw new Error('DATABASE_URL is required');
    }

    admin = new DataSource({ type: 'postgres', url: adminUrl });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${dbName}`;
    dataSource = new DataSource({
      type: 'postgres',
      url: url.href,
      namingStrategy,
      entities: [ExpoProjectionEntity, ExpoProjectionVersionEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    store = new ExpoProjectionStore(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  it('이벤트를 받은 적 없는 박람회는 미스다', async () => {
    await expect(store.find(randomUUID())).resolves.toEqual({ state: 'miss' });
  });

  it('변경 이벤트로 기간을 덮어쓰고, 같은 이벤트를 다시 받으면 무시한다', async () => {
    const expoId = randomUUID();
    const first = changed(expoId, 10);

    await expect(store.apply(first)).resolves.toBe('applied');
    await expect(store.apply(first)).resolves.toBe('stale');
    await expect(store.apply(changed(expoId, 12, '2030-01-05'))).resolves.toBe(
      'applied',
    );

    await expect(store.find(expoId)).resolves.toEqual({
      state: 'present',
      period: { startedDay: '2030-01-01', finishedDay: '2030-01-05' },
    });
  });

  it('늦게 도착한 옛 버전은 최신 상태를 되돌리지 못한다', async () => {
    const expoId = randomUUID();
    await store.apply(changed(expoId, 20, '2030-02-01'));

    await expect(store.apply(changed(expoId, 15, '2030-01-15'))).resolves.toBe(
      'stale',
    );
    await expect(store.find(expoId)).resolves.toMatchObject({
      period: { finishedDay: '2030-02-01' },
    });
  });

  it('tombstone은 프로젝션을 지우고 버전은 남겨 옛 이벤트로 되살아나지 않는다', async () => {
    const expoId = randomUUID();
    await store.apply(changed(expoId, 30));

    await expect(store.apply(tombstone(expoId, 31))).resolves.toBe('applied');
    await expect(store.find(expoId)).resolves.toEqual({ state: 'deleted' });
    await expect(
      dataSource.getRepository(ExpoProjectionEntity).existsBy({ expoId }),
    ).resolves.toBe(false);

    await expect(store.apply(changed(expoId, 30))).resolves.toBe('stale');
    await expect(store.find(expoId)).resolves.toEqual({ state: 'deleted' });
  });

  it('같은 박람회의 이벤트가 동시에 와도 가장 큰 버전만 남는다', async () => {
    const expoId = randomUUID();
    const versions = [41, 45, 43, 44, 42];

    await Promise.all(
      versions.map(async (version) =>
        store.apply(changed(expoId, version, `2030-03-${version - 20}`)),
      ),
    );

    await expect(store.find(expoId)).resolves.toMatchObject({
      period: { finishedDay: '2030-03-25' },
    });
    const saved = await dataSource
      .getRepository(ExpoProjectionVersionEntity)
      .findOneByOrFail({ expoId });
    expect(saved.version).toBe('45');
  });
});
