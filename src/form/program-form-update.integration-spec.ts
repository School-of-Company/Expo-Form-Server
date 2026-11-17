import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { DataSource, type Logger } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoEntity } from '../deleted-expo/entities/deleted-expo.entity.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { DynamicFormType } from './entities/dynamic-form-type.enum.js';
import { FormPurpose } from './entities/form-purpose.enum.js';
import { FormEntity } from './entities/form.entity.js';
import type { NewDynamicFormField } from './dynamic-form-field.js';
import { FormStore } from './form.store.js';

/**
 * 프로그램용 폼을 동시에 수정할 때 낙관적 락(`expectedVersion`)이 실제 PostgreSQL에서 한 명만 통과시키는지
 * 확인한다. `DATABASE_URL`의 서버에 임시 DB를 만들고 끝나면 지운다. 실행: `DATABASE_URL=... pnpm test:integration`
 */
const adminUrl = process.env.DATABASE_URL;

function field(title: string): NewDynamicFormField {
  return {
    title,
    formType: DynamicFormFieldType.SENTENCE,
    requiredStatus: true,
    jsonData: {},
    otherJson: null,
    dynamicFormType: DynamicFormType.DEFAULT,
  };
}

/** 실행한 SQL을 모은다. 조회가 쿼리 몇 개로 끝나는지 단언하는 데 쓴다. */
const queries: string[] = [];
const queryLogger: Logger = {
  logQuery(query) {
    queries.push(query);
  },
  logQueryError: () => undefined,
  logQuerySlow: () => undefined,
  logSchemaBuild: () => undefined,
  logMigration: () => undefined,
  log: () => undefined,
};

describe.skipIf(adminUrl === undefined)(
  '프로그램용 폼 동시 수정 / PostgreSQL',
  () => {
    const dbName = `program_form_${randomUUID().replaceAll('-', '')}`;
    let admin: DataSource;
    let dataSource: DataSource;
    let store: FormStore;
    const expoId = randomUUID();

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
        entities: [DeletedExpoEntity, FormEntity],
        synchronize: true,
        logging: ['query'],
        logger: queryLogger,
      });
      await dataSource.initialize();
      // 운영에서는 마이그레이션이 남겨 둔 시퀀스다. synchronize는 엔티티에 없는 시퀀스를 만들지 않는다.
      await dataSource.query('CREATE SEQUENCE "dynamic_form_id_seq"');
      store = new FormStore(
        dataSource.getRepository(FormEntity),
        dataSource,
        new DeletedExpoStore(),
      );
    });

    afterAll(async () => {
      await dataSource?.destroy();
      await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin?.destroy();
    });

    async function createProgramForm(title: string): Promise<FormEntity> {
      return store.save(
        Object.assign(new FormEntity(), {
          expoId,
          purpose: FormPurpose.PROGRAM,
          title,
          informationText: '안내',
          participationType: ParticipationType.STANDARD,
          applicationType: null,
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-31T00:00:00Z'),
          occupationOpenAt: null,
        }),
        [field('이름')],
      );
    }

    async function load(id: string): Promise<FormEntity> {
      const form = await store.findProgramById(id);
      if (form === null) {
        throw new Error('form missing');
      }

      return form;
    }

    it('같은 version을 들고 동시에 저장하면 한 명만 반영되고 다른 한 명은 CONFLICT다', async () => {
      const created = await createProgramForm('동시 수정');
      const [a, b] = await Promise.all([load(created.id), load(created.id)]);
      a.title = 'A의 수정';
      b.title = 'B의 수정';

      const results = await Promise.all([
        store.updateProgramWithFields(a, 1, [field('A 문항')]),
        store.updateProgramWithFields(b, 1, [field('B 문항')]),
      ]);

      expect(results.map((result) => result.status).toSorted()).toEqual([
        'CONFLICT',
        'UPDATED',
      ]);
      const winner = results.find((result) => result.status === 'UPDATED');
      const saved = await load(created.id);
      expect(saved.version).toBe(2);
      expect(winner).toEqual({ status: 'UPDATED', version: 2 });
      // 진 쪽의 수정은 어느 것도 섞여 들어가지 않는다.
      expect(saved.dynamicForms).toHaveLength(1);
      expect(['A의 수정', 'B의 수정']).toContain(saved.title);
      expect(saved.dynamicForms[0]?.title).toBe(
        saved.title === 'A의 수정' ? 'A 문항' : 'B 문항',
      );
    });

    it('폼 조회는 필드 수와 상관없이 쿼리 1개로 끝나고, 필드 id는 작성 순서대로 오른다', async () => {
      const created = await createProgramForm('쿼리 수');
      await store.updateProgramWithFields(
        await load(created.id),
        1,
        ['첫째', '둘째', '셋째'].map((title) => field(title)),
      );

      queries.length = 0;
      const saved = await load(created.id);

      expect(queries).toHaveLength(1);
      const ids = saved.dynamicForms.map((item) => item.id);
      expect(ids).toEqual(ids.toSorted((a, b) => a - b));
      expect(saved.dynamicForms.map((item) => item.title)).toEqual([
        '첫째',
        '둘째',
        '셋째',
      ]);
    });

    it('먼저 저장된 뒤 늦게 도착한 옛 version 저장은 CONFLICT고 아무것도 바꾸지 않는다', async () => {
      const created = await createProgramForm('늦은 저장');
      const [a, b] = await Promise.all([load(created.id), load(created.id)]);
      a.title = '먼저';
      await expect(
        store.updateProgramWithFields(a, 1, [field('먼저 문항')]),
      ).resolves.toEqual({ status: 'UPDATED', version: 2 });

      b.title = '늦게';
      await expect(
        store.updateProgramWithFields(b, 1, [field('늦은 문항')]),
      ).resolves.toEqual({ status: 'CONFLICT' });

      const saved = await load(created.id);
      expect(saved.title).toBe('먼저');
      expect(saved.version).toBe(2);
      expect(saved.dynamicForms.map((item) => item.title)).toEqual([
        '먼저 문항',
      ]);
    });
  },
);
