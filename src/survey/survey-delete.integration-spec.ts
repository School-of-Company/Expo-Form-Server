import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyStore } from './survey.store.js';

/**
 * 설문 하나를 지울 때 그 설문의 접수 기록(아웃박스)도 함께 사라지는지 실제 Postgres로 확인한다. 접수 기록에는 설문
 * FK가 없어 CASCADE가 닿지 않으므로, 지우지 않으면 릴레이가 지워진 설문의 답변을 계속 발행한다.
 * `DATABASE_URL`의 서버에 임시 DB를 만들고 끝나면 지운다.
 */
const adminUrl = process.env.DATABASE_URL;

describe.skipIf(adminUrl === undefined)('설문 삭제와 접수 기록', () => {
  const dbName = `survey_delete_it_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let store: SurveyStore;
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

    store = new SurveyStore(
      dataSource.getRepository(SurveyEntity),
      dataSource,
      new DeletedExpoStore(),
    );
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  async function createSurvey(participationType: ParticipationType) {
    const repository = dataSource.getRepository(SurveyEntity);
    return repository.save(
      repository.create({
        expoId,
        title: '설문',
        informationText: '안내',
        participationType,
      }),
    );
  }

  async function addSubmission(surveyId: string, phoneNumber: string) {
    await dataSource.getRepository(SurveyAnswerSubmissionEntity).insert({
      surveyId,
      eventId: randomUUID(),
      expoId,
      participationType: ParticipationType.STANDARD,
      phoneNumber,
      status: SurveyAnswerSubmissionStatus.RECEIVED,
      payload: { answers: {}, personalInformationStatus: true },
    });
  }

  const submissionCount = async (surveyId: string) =>
    dataSource
      .getRepository(SurveyAnswerSubmissionEntity)
      .count({ where: { surveyId } });

  it('설문을 지우면 그 설문의 접수 기록도 지워지고 다른 설문의 것은 남는다', async () => {
    const target = await createSurvey(ParticipationType.STANDARD);
    const other = await createSurvey(ParticipationType.TRAINEE);
    await addSubmission(target.id, '01011112222');
    await addSubmission(target.id, '01011113333');
    await addSubmission(other.id, '01011114444');

    await store.deleteById(target.id);

    expect(await submissionCount(target.id)).toBe(0);
    expect(await submissionCount(other.id)).toBe(1);
    expect(
      await dataSource.getRepository(SurveyEntity).existsBy({ id: target.id }),
    ).toBe(false);
    expect(
      await dataSource.getRepository(SurveyEntity).existsBy({ id: other.id }),
    ).toBe(true);
  });

  it('접수 기록이 없는 설문도 문제없이 지워진다', async () => {
    const empty = await createSurvey(ParticipationType.STANDARD);

    await expect(store.deleteById(empty.id)).resolves.toBeUndefined();
    expect(
      await dataSource.getRepository(SurveyEntity).existsBy({ id: empty.id }),
    ).toBe(false);
  });
});
