import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { namingStrategy } from '../database/database.config.js';
import { MetricsCollectorsService } from '../metrics/metrics-collectors.service.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';

/**
 * 아웃박스 지표의 집계 SQL을 실제 Postgres로 확인한다(컬럼 이름·상태 조건·부분 인덱스가 맞는지). `DATABASE_URL`의 서버에 임시
 * DB를 만들고 끝나면 지운다. 실행: `DATABASE_URL=... pnpm test:integration`
 */
const adminUrl = process.env.DATABASE_URL;

describe.skipIf(adminUrl === undefined)('아웃박스 지표 집계', () => {
  const dbName = `metrics_it_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let collectors: MetricsCollectorsService;
  let surveyId: string;
  const expoId = randomUUID();

  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url: adminUrl });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${dbName}"`);

    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    dataSource = new DataSource({
      type: 'postgres',
      url: url.href,
      entities: [
        SurveyEntity,
        DynamicSurveyEntity,
        SurveyDrawResultEntity,
        SurveyAnswerSubmissionEntity,
      ],
      namingStrategy,
      synchronize: true,
    });
    await dataSource.initialize();

    const survey = await dataSource.getRepository(SurveyEntity).save(
      dataSource.getRepository(SurveyEntity).create({
        expoId,
        title: '설문',
        informationText: '안내',
        participationType: ParticipationType.STANDARD,
      }),
    );
    surveyId = survey.id;
    collectors = new MetricsCollectorsService(
      dataSource,
      new ConfigService(
        Object.fromEntries([
          ['SURVEY_ANSWER_MAX_RETRY_COUNT', 5],
          ['SURVEY_DRAW_RESULT_MAX_RETRY_COUNT', 100],
        ]),
      ),
    );
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  async function addSubmission(
    status: SurveyAnswerSubmissionStatus,
    retryCount: number,
    phone: string,
    createdMinutesAgo = 0,
  ) {
    const repository = dataSource.getRepository(SurveyAnswerSubmissionEntity);
    const { identifiers } = await repository.insert({
      surveyId,
      eventId: randomUUID(),
      expoId,
      participationType: ParticipationType.STANDARD,
      phoneNumber: phone,
      status,
      retryCount,
      payload: { answers: {}, personalInformationStatus: true },
    });
    await dataSource.query(
      `UPDATE survey_answer_submission SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
      [identifiers[0].id, createdMinutesAgo],
    );
  }

  it('접수 건을 상태별로 세고 한도에 닿은 건을 따로 센다', async () => {
    await addSubmission(
      SurveyAnswerSubmissionStatus.RECEIVED,
      0,
      '01000000001',
      10,
    );
    await addSubmission(
      SurveyAnswerSubmissionStatus.RECEIVED,
      0,
      '01000000002',
      2,
    );
    await addSubmission(
      SurveyAnswerSubmissionStatus.PUBLISHED,
      2,
      '01000000003',
    );
    await addSubmission(
      SurveyAnswerSubmissionStatus.PUBLISHED,
      5,
      '01000000004',
    );
    await addSubmission(SurveyAnswerSubmissionStatus.STORED, 1, '01000000005');
    await addSubmission(
      SurveyAnswerSubmissionStatus.REJECTED,
      1,
      '01000000006',
    );

    const snapshot = await collectors.snapshot();

    expect(snapshot?.answer).toMatchObject({
      received: 2,
      published: 1,
      exhausted: 1,
    });
    // 가장 오래된 RECEIVED는 10분 전
    expect(snapshot?.answer.oldestReceivedAgeSeconds).toBeGreaterThan(590);
    expect(snapshot?.answer.oldestReceivedAgeSeconds).toBeLessThan(700);
  });

  it('미발행 당첨 결과를 세고, 번호 없는 건·발행된 건·한도 도달 건을 구분한다', async () => {
    const repository = dataSource.getRepository(SurveyDrawResultEntity);
    const base = { surveyId, phoneNumber: '01011112222' as string | null };
    await repository.insert([
      { ...base, eventId: randomUUID(), drawNumber: 1, retryCount: 0 },
      { ...base, eventId: randomUUID(), drawNumber: 2, retryCount: 3 },
      { ...base, eventId: randomUUID(), drawNumber: 3, retryCount: 100 },
      // 번호 없이 당첨된 기록은 문자를 보내지 않으므로 세지 않는다.
      {
        ...base,
        eventId: randomUUID(),
        drawNumber: 4,
        phoneNumber: null,
        retryCount: 0,
      },
      // 이미 발행됨
      {
        ...base,
        eventId: randomUUID(),
        drawNumber: 5,
        retryCount: 0,
        publishedAt: new Date(),
      },
    ]);
    // 캐시를 비우려고 새 인스턴스를 쓴다.
    const fresh = new MetricsCollectorsService(
      dataSource,
      new ConfigService({}),
    );

    const snapshot = await fresh.snapshot();

    expect(snapshot?.draw).toMatchObject({ unpublished: 2, exhausted: 1 });
  });

  it('부분 인덱스가 만들어져 있고 진행 중인 건만 조회하는 쿼리에 쓰인다', async () => {
    const indexes = await dataSource.query<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('IX_survey_answer_submission_in_flight', 'IX_survey_draw_result_unpublished')`,
    );

    expect(indexes.map((row) => row.indexname).toSorted()).toEqual([
      'IX_survey_answer_submission_in_flight',
      'IX_survey_draw_result_unpublished',
    ]);
  });

  it('DB 오류면 undefined를 돌려주고 던지지 않는다', async () => {
    const broken = new MetricsCollectorsService(
      {
        async query() {
          throw new Error('down');
        },
      } as unknown as DataSource,
      new ConfigService({}),
    );

    await expect(broken.snapshot()).resolves.toBeUndefined();
  });
});
