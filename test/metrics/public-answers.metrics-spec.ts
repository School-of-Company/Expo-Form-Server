import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { DataSource, type Logger } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../../src/common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../../src/common/enums/participation-type.enum.js';
import { DomainExceptionFilter } from '../../src/common/exceptions/domain-exception.filter.js';
import { InternalTokenGuard } from '../../src/common/http/internal-token.guard.js';
import { namingStrategy } from '../../src/database/database.config.js';
import { DeletedExpoStore } from '../../src/deleted-expo/deleted-expo.store.js';
import { SurveyDrawResultEntity } from '../../src/survey/entities/survey-draw-result.entity.js';
import { SurveyGiftClaimEntity } from '../../src/survey/entities/survey-gift-claim.entity.js';
import { SurveyGiftPinEntity } from '../../src/survey/entities/survey-gift-pin.entity.js';
import { SurveyLotteryParticipantEntity } from '../../src/survey/entities/survey-lottery-participant.entity.js';
import { SurveyPublicAnswerEntity } from '../../src/survey/entities/survey-public-answer.entity.js';
import { SurveyEntity } from '../../src/survey/entities/survey.entity.js';
import { InternalSurveyController } from '../../src/survey/internal-survey.controller.js';
import { SurveyPublicAnswerStore } from '../../src/survey/survey-public-answer.store.js';
import { SurveyPublicService } from '../../src/survey/survey-public.service.js';
import { SurveyService } from '../../src/survey/survey.service.js';
import { SurveyStore } from '../../src/survey/survey.store.js';

/**
 * `GET /internal/surveys/:expoId/public-answers`의 쿼리 수와 응답 바이트를 고정 시드로 재서 JSON으로 남긴다
 * (report/metric-plan.md 1~3장, 6장). 값이 축마다·반복마다 같은지만 단언하고, 절댓값 상한은 걸지 않는다.
 */
const adminUrl = process.env.DATABASE_URL;
const TOKEN = 'metrics-internal-token-0000000000000000';
const N = 250;
const LIMIT = 100;
const NOISE_ROWS = 1000;
const START = '2020-01-01T00:00:00Z';

/** 측정 대상 설문들. id·박람회 id를 고정해 응답 바이트가 실행마다 같게 한다. */
const SURVEYS = {
  n: { prefix: 1, rows: N, questionRepeat: 1 },
  twoN: { prefix: 2, rows: N * 2, questionRepeat: 1 },
  q30: { prefix: 3, rows: N, questionRepeat: 10 },
  noise: { prefix: 9, rows: NOISE_ROWS, questionRepeat: 1 },
} as const;

const fixedUuid = (prefix: number, index: number) =>
  `00000000-0000-4000-8${prefix}00-${String(index).padStart(12, '0')}`;

/** 기존 통합 테스트의 합성 설문과 같은 문항 3개(문장형·체크박스·드롭다운)를 `repeat`번 반복한다. */
function questions(repeat: number) {
  return Array.from({ length: repeat }, (_, round) => {
    const base = round * 3;
    return [
      {
        id: base + 1,
        title: `opinion ${round}`,
        formType: DynamicFormFieldType.SENTENCE,
        requiredStatus: true,
        jsonData: {},
        otherJson: null,
      },
      {
        id: base + 2,
        title: `revisit ${round}`,
        formType: DynamicFormFieldType.CHECKBOX,
        requiredStatus: false,
        jsonData: {},
        otherJson: null,
      },
      {
        id: base + 3,
        title: `rating ${round}`,
        formType: DynamicFormFieldType.DROPDOWN,
        requiredStatus: false,
        jsonData: { '1': 'good', '2': 'fair' },
        otherJson: null,
      },
    ];
  }).flat();
}

type PageMeasure = {
  queries: string[];
  bytes: number;
  nextCursor: string | null;
};

describe.skipIf(adminUrl === undefined)('public-answers 성능 지표', () => {
  const dbName = `perf_metrics_${randomUUID().replaceAll('-', '')}`;
  const queries: string[] = [];
  const logger: Logger = {
    logQuery(query) {
      queries.push(query.replaceAll(/\s+/gu, ' ').trim());
    },
    logQueryError: () => undefined,
    logQuerySlow: () => undefined,
    logSchemaBuild: () => undefined,
    logMigration: () => undefined,
    log: () => undefined,
  };
  let admin: DataSource;
  let dataSource: DataSource;
  let app: INestApplication<Server>;

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
      entities: [
        SurveyEntity,
        SurveyDrawResultEntity,
        SurveyPublicAnswerEntity,
        SurveyLotteryParticipantEntity,
        SurveyGiftPinEntity,
        SurveyGiftClaimEntity,
      ],
      synchronize: true,
      logging: ['query'],
      logger,
    });
    await dataSource.initialize();

    for (const { prefix, rows, questionRepeat } of Object.values(SURVEYS)) {
      const surveyId = fixedUuid(prefix, 0);
      // eslint-disable-next-line no-await-in-loop -- 시드는 순서대로 넣는다.
      await dataSource.getRepository(SurveyEntity).insert({
        id: surveyId,
        expoId: fixedUuid(prefix, 999_999),
        title: 'metrics public survey',
        informationText: 'info',
        participationType: ParticipationType.STANDARD,
        dynamicSurveys: questions(questionRepeat),
      });
      // 응답 id·시각·내용을 i로 정해 바이트와 정렬을 고정한다. 시각은 조회 상한보다 과거여야 한다.
      // eslint-disable-next-line no-await-in-loop -- 시드는 순서대로 넣는다.
      await dataSource.query(
        `INSERT INTO survey_public_answer (id, survey_id, answers, occupation, created_at)
         SELECT ('00000000-0000-4000-8' || $3::text || '00-' || lpad(i::text, 12, '0'))::uuid,
                $1::uuid,
                jsonb_build_object('1', 'answer ' || lpad(i::text, 4, '0'), '2', (i % 2 = 0), '3', '1'),
                'GENERAL',
                $4::timestamptz + make_interval(secs => i)
           FROM generate_series(1, $2::int) AS i`,
        [surveyId, rows, String(prefix), START],
      );
    }

    const publicService = new SurveyPublicService(
      new SurveyStore(
        dataSource.getRepository(SurveyEntity),
        dataSource,
        new DeletedExpoStore(),
      ),
      new SurveyPublicAnswerStore(dataSource),
    );
    const module = await Test.createTestingModule({
      controllers: [InternalSurveyController],
      providers: [
        { provide: SurveyPublicService, useValue: publicService },
        { provide: SurveyService, useValue: {} },
        {
          provide: ConfigService,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- 환경 변수 이름이다.
          useValue: new ConfigService({ INTERNAL_TOKEN: TOKEN }),
        },
        InternalTokenGuard,
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  /** 요청 한 번 사이에 실행된 SQL만 센다. 앞 요청이나 시드의 쿼리가 섞이지 않게 직전에 비운다. */
  async function fetchPage(
    expoId: string,
    cursor: string | null,
  ): Promise<PageMeasure> {
    queries.length = 0;
    const response = await request(app.getHttpServer())
      .get(`/internal/surveys/${expoId}/public-answers`)
      .set('X-Internal-Token', TOKEN)
      .query({ limit: String(LIMIT), ...(cursor !== null && { cursor }) });
    const executed = [...queries];
    expect(response.status).toBe(200);
    const body = response.body as { nextCursor: string | null };
    return {
      queries: executed,
      bytes: Buffer.byteLength(response.text, 'utf8'),
      nextCursor: body.nextCursor,
    };
  }

  async function measureSurvey(prefix: number) {
    const expoId = fixedUuid(prefix, 999_999);
    await fetchPage(expoId, null); // 첫 연결·준비 쿼리가 측정에 섞이지 않게 한 번 데운다.
    const first = await fetchPage(expoId, null);
    const next = await fetchPage(expoId, first.nextCursor);
    return { first, next };
  }

  /** 시드 N 설문을 끝까지 받아 전체 바이트와 `answers` 배열만의 바이트를 더한다. */
  async function measureTotal() {
    const expoId = fixedUuid(SURVEYS.n.prefix, 999_999);
    let cursor: string | null = null;
    let total = 0;
    let answerBytes = 0;
    do {
      queries.length = 0;
      // eslint-disable-next-line no-await-in-loop -- 커서가 앞 페이지 응답에 달려 있어 차례로 읽어야 한다.
      const response = await request(app.getHttpServer())
        .get(`/internal/surveys/${expoId}/public-answers`)
        .set('X-Internal-Token', TOKEN)
        .query({ limit: String(LIMIT), ...(cursor !== null && { cursor }) });
      expect(response.status).toBe(200);
      const body = response.body as {
        answers: unknown[];
        nextCursor: string | null;
      };
      total += Buffer.byteLength(response.text, 'utf8');
      answerBytes += Buffer.byteLength(JSON.stringify(body.answers), 'utf8');
      cursor = body.nextCursor;
    } while (cursor !== null);

    return { total, perRow: Math.round(answerBytes / N) };
  }

  async function measureAll() {
    const n = await measureSurvey(SURVEYS.n.prefix);
    const twoN = await measureSurvey(SURVEYS.twoN.prefix);
    const q30 = await measureSurvey(SURVEYS.q30.prefix);
    const { total, perRow } = await measureTotal();
    return {
      metrics: {
        'queries.firstPage': {
          n: n.first.queries.length,
          '2n': twoN.first.queries.length,
          q30: q30.first.queries.length,
        },
        'queries.nextPage': {
          n: n.next.queries.length,
          '2n': twoN.next.queries.length,
          q30: q30.next.queries.length,
        },
        'bytes.firstPage': n.first.bytes,
        'bytes.nextPage': n.next.bytes,
        'bytes.total': total,
        'bytes.perRow': perRow,
      },
      sql: { firstPage: n.first.queries, nextPage: n.next.queries },
    };
  }

  it('쿼리 수가 응답 수·문항 수와 무관하고, 두 번 재도 값이 같다', async () => {
    const run1 = await measureAll();
    const run2 = await measureAll();
    const stable = JSON.stringify(run1) === JSON.stringify(run2);

    const [{ server_version: postgres }] = await dataSource.query<
      Array<{ server_version: string }>
    >('SHOW server_version');
    const result = {
      schemaVersion: 1,
      metricSet: 'public-answers',
      endpoint: 'GET /internal/surveys/:expoId/public-answers',
      source: {
        sha: process.env.GITHUB_SHA ?? null,
        baseSha: process.env.PERF_BASE_SHA ?? null,
        event: process.env.GITHUB_EVENT_NAME ?? null,
        runId: Number(process.env.GITHUB_RUN_ID ?? 0),
        runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 0),
      },
      env: { postgres, node: process.version },
      seed: { n: N, limit: LIMIT, questions: [3, 30], noiseRows: NOISE_ROWS },
      ...run1,
      stable,
    };
    const outDir = path.join(
      process.env.RUNNER_TEMP ?? tmpdir(),
      'perf-metrics',
    );
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, 'public-answers.json'),
      `${JSON.stringify(result, null, 2)}\n`,
    );

    for (const key of ['queries.firstPage', 'queries.nextPage'] as const) {
      const { n, '2n': twoN, q30 } = run1.metrics[key];
      expect({ key, twoN, q30 }).toEqual({ key, twoN: n, q30: n });
    }

    expect(stable).toBe(true);
  });
});
