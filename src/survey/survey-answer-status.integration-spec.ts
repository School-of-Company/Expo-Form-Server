import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { namingStrategy } from '../database/database.config.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

/**
 * 본인 응답 상태 조회(`findLatestByKey`)가 실제 Postgres에서 가장 최근 기록을 돌려주는지 확인한다. 거절된 뒤 다시 제출한
 * 경우(거절 기록과 활성 기록이 함께 있는 경우)가 핵심이다. `DATABASE_URL`의 서버에 임시 DB를 만들고 끝나면 지운다.
 */
const adminUrl = process.env.DATABASE_URL;

describe.skipIf(adminUrl === undefined)('설문 응답 상태 조회', () => {
  const dbName = `answer_status_it_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let store: SurveyAnswerSubmissionStore;
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

    store = new SurveyAnswerSubmissionStore(
      dataSource.getRepository(SurveyAnswerSubmissionEntity),
      dataSource,
    );
    const survey = await dataSource.getRepository(SurveyEntity).save(
      dataSource.getRepository(SurveyEntity).create({
        expoId,
        title: '설문',
        informationText: '안내',
        participationType: ParticipationType.STANDARD,
      }),
    );
    surveyId = survey.id;
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  async function add(
    phoneNumber: string,
    status: SurveyAnswerSubmissionStatus,
    minutesAgo: number,
  ) {
    const { identifiers } = await dataSource
      .getRepository(SurveyAnswerSubmissionEntity)
      .insert({
        surveyId,
        eventId: randomUUID(),
        expoId,
        participationType: ParticipationType.STANDARD,
        phoneNumber,
        status,
        payload: { answers: {}, personalInformationStatus: true },
      });
    await dataSource.query(
      `UPDATE survey_answer_submission SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
      [identifiers[0].id, minutesAgo],
    );
  }

  it('기록이 없으면 null이다', async () => {
    await expect(
      store.findLatestByKey(surveyId, '01000000000'),
    ).resolves.toBeNull();
  });

  it('거절된 뒤 다시 제출했으면 더 최근의 활성 기록을 돌려준다', async () => {
    await add('01011110001', SurveyAnswerSubmissionStatus.REJECTED, 30);
    await add('01011110001', SurveyAnswerSubmissionStatus.RECEIVED, 1);

    const latest = await store.findLatestByKey(surveyId, '01011110001');

    expect(latest?.status).toBe(SurveyAnswerSubmissionStatus.RECEIVED);
  });

  it('거절만 있으면 거절 기록을 돌려준다', async () => {
    await add('01011110002', SurveyAnswerSubmissionStatus.REJECTED, 5);

    const latest = await store.findLatestByKey(surveyId, '01011110002');

    expect(latest?.status).toBe(SurveyAnswerSubmissionStatus.REJECTED);
  });

  it('다른 번호의 기록은 섞이지 않는다', async () => {
    await add('01011110003', SurveyAnswerSubmissionStatus.STORED, 5);

    await expect(
      store.findLatestByKey(surveyId, '01011110099'),
    ).resolves.toBeNull();
  });
});
