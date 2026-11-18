import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import process from 'node:process';
import {
  DataSource,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { namingStrategy } from './database.config.js';
import { EmbedDynamicFields1792600000000 } from './migrations/1792600000000-EmbedDynamicFields.js';

/**
 * 필드를 jsonb로 옮기는 마이그레이션이 옛 테이블의 id·순서·값을 그대로 옮기고, CHECK가 깨진 배열을 막고, `down`이
 * 옛 테이블로 되돌리는지 확인한다. 그 앞의 마이그레이션까지 실행한 DB에 옛 모양으로 시드를 넣고 이 마이그레이션만 돌린다.
 */
const adminUrl = process.env.DATABASE_URL;

/** 이 마이그레이션보다 앞선 마이그레이션들. 파일 이름이 타임스탬프로 시작하므로 이름순이 실행 순서다. */
async function migrationsBefore(
  target: MigrationInterface,
): Promise<MigrationInterface[]> {
  const directory = new URL('migrations/', import.meta.url);
  const entries = await readdir(directory);
  const files = entries.filter((file) => file.endsWith('.ts')).toSorted();
  const modules = await Promise.all(
    files.map(
      async (file) =>
        (await import(new URL(file, directory).href)) as Record<
          string,
          new () => MigrationInterface
        >,
    ),
  );
  return modules
    .flatMap((module) => Object.values(module))
    .map((Migration) => new Migration())
    .filter((migration) => migration.name !== target.name);
}

describe.skipIf(adminUrl === undefined)(
  '필드 jsonb 전환 마이그레이션 / PostgreSQL',
  () => {
    const dbName = `embed_fields_${randomUUID().replaceAll('-', '')}`;
    const formId = randomUUID();
    const surveyId = randomUUID();
    const migration = new EmbedDynamicFields1792600000000();
    let admin: DataSource;
    let dataSource: DataSource;

    async function run(step: (runner: QueryRunner) => Promise<void>) {
      const runner = dataSource.createQueryRunner();
      try {
        await step(runner);
      } finally {
        await runner.release();
      }
    }

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
      });
      await dataSource.initialize();

      for (const m of await migrationsBefore(migration)) {
        // eslint-disable-next-line no-await-in-loop -- 마이그레이션은 차례로 실행해야 한다.
        await run(async (runner) => {
          await m.up(runner);
        });
      }

      await dataSource.query(
        `INSERT INTO "form" ("id", "purpose", "title", "information_text", "participation_type", "application_type", "start_date", "end_date", "expo_id")
         VALUES ($1, 'REGISTRATION', '폼', '안내', 'STANDARD', 'PRE', now(), now(), $2)`,
        [formId, randomUUID()],
      );
      await dataSource.query(
        `INSERT INTO "survey" ("id", "title", "information_text", "participation_type", "expo_id")
         VALUES ($1, '설문', '안내', 'STANDARD', $2)`,
        [surveyId, randomUUID()],
      );
      // 입력 순서와 id 순서를 일부러 다르게 넣는다. 표시 순서는 id 오름차순이다.
      await dataSource.query(
        `INSERT INTO "dynamic_form" ("id", "title", "form_type", "required_status", "json_data", "other_json", "dynamic_form_type", "form_id")
         VALUES (30, '전화번호', 'SENTENCE', true, '{}', NULL, 'PHONE_NUMBER', $1),
                (10, '이름', 'SENTENCE', true, '{}', NULL, 'NAME', $1),
                (20, '관심 분야', 'DROPDOWN', false, '{"1":"AI"}', '{"hasEtc":true,"maxSelection":2}', 'DEFAULT', $1)`,
        [formId],
      );
      await dataSource.query(
        `INSERT INTO "dynamic_survey" ("id", "title", "form_type", "required_status", "json_data", "other_json", "survey_id")
         VALUES (7, '만족도', 'DROPDOWN', true, '{"1":"좋음"}', NULL, $1)`,
        [surveyId],
      );

      await run(async (runner) => migration.up(runner));
    });

    afterAll(async () => {
      await dataSource?.destroy();
      await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin?.destroy();
    });

    it('옛 테이블의 필드를 id·순서·값 그대로 옮긴다', async () => {
      const [form] = await dataSource.query<Array<{ fields: unknown }>>(
        `SELECT "fields" FROM "form" WHERE "id" = $1`,
        [formId],
      );
      expect(form.fields).toEqual([
        {
          id: 10,
          title: '이름',
          formType: 'SENTENCE',
          requiredStatus: true,
          jsonData: {},
          otherJson: null,
          dynamicFormType: 'NAME',
        },
        {
          id: 20,
          title: '관심 분야',
          formType: 'DROPDOWN',
          requiredStatus: false,
          jsonData: { '1': 'AI' },
          otherJson: { hasEtc: true, maxSelection: 2 },
          dynamicFormType: 'DEFAULT',
        },
        {
          id: 30,
          title: '전화번호',
          formType: 'SENTENCE',
          requiredStatus: true,
          jsonData: {},
          otherJson: null,
          dynamicFormType: 'PHONE_NUMBER',
        },
      ]);

      const [survey] = await dataSource.query<Array<{ questions: unknown }>>(
        `SELECT "questions" FROM "survey" WHERE "id" = $1`,
        [surveyId],
      );
      expect(survey.questions).toEqual([
        {
          id: 7,
          title: '만족도',
          formType: 'DROPDOWN',
          requiredStatus: true,
          jsonData: { '1': '좋음' },
          otherJson: null,
        },
      ]);
    });

    it('새 id는 옛 테이블의 시퀀스를 이어 받는다', async () => {
      const [{ id }] = await dataSource.query<Array<{ id: string }>>(
        `SELECT nextval('dynamic_form_id_seq') AS id`,
      );
      expect(Number(id)).toBeGreaterThan(0);
    });

    it.each([
      ['겹치는 id', '[{"id":1},{"id":1}]'],
      ['0인 id', '[{"id":0}]'],
      ['소수 id', '[{"id":1.5}]'],
      ['문자열 id', '[{"id":"1"}]'],
      ['id 없음', '[{"title":"x"}]'],
      ['배열 아님', '{}'],
    ])('CHECK가 %s를 막는다', async (_, fields) => {
      await expect(
        dataSource.query(`UPDATE "form" SET "fields" = $1 WHERE "id" = $2`, [
          fields,
          formId,
        ]),
      ).rejects.toThrow(/CHK_form_fields_valid/u);
    });

    it('down은 전환 뒤 바뀐 필드를 옛 테이블에 되돌려 쓴다', async () => {
      await dataSource.query(
        `UPDATE "form" SET "fields" = '[{"id":10,"title":"이름","formType":"SENTENCE","requiredStatus":true,"jsonData":{},"otherJson":null,"dynamicFormType":"NAME"},{"id":99,"title":"새 문항","formType":"SENTENCE","requiredStatus":false,"jsonData":{},"otherJson":null,"dynamicFormType":"DEFAULT"}]' WHERE "id" = $1`,
        [formId],
      );

      await run(async (runner) => migration.down(runner));

      const rows = await dataSource.query<
        Array<{ id: number; title: string; otherJson: unknown }>
      >(
        `SELECT "id", "title", "other_json" AS "otherJson" FROM "dynamic_form" WHERE "form_id" = $1 ORDER BY "id"`,
        [formId],
      );
      expect(rows).toEqual([
        { id: 10, title: '이름', otherJson: null },
        { id: 99, title: '새 문항', otherJson: null },
      ]);
      const columns = await dataSource.query<unknown[]>(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'form' AND column_name = 'fields'`,
      );
      expect(columns).toHaveLength(0);
    });
  },
);
