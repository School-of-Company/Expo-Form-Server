import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { DataSource, type QueryRunner } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyAlreadyAnsweredException } from '../common/exceptions/domain.exception.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoEntity } from '../deleted-expo/entities/deleted-expo.entity.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import type { NewDynamicSurveyQuestion } from './dynamic-survey-question.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
import { SurveyStore } from './survey.store.js';

/**
 * 로그인/SMS 답변 접수가 설문 행을 `FOR KEY SHARE`로만 잠그고 응답 수를 접수 기록으로 셀 때, 삭제·문항 교체와의
 * 순서와 응답 수가 실제 Postgres에서 맞는지 확인한다. `DATABASE_URL`의 서버에 임시 DB를 만들고 끝나면 지운다.
 */
const adminUrl = process.env.DATABASE_URL;

function question(title: string): NewDynamicSurveyQuestion {
  return {
    title,
    formType: DynamicFormFieldType.DROPDOWN,
    requiredStatus: true,
    jsonData: { '1': '좋음' },
    otherJson: null,
  };
}

describe.skipIf(adminUrl === undefined)('설문 응답 수와 접수 잠금', () => {
  const dbName = `answer_count_it_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let surveyStore: SurveyStore;
  let submissionStore: SurveyAnswerSubmissionStore;
  let answerStore: SurveyPublicAnswerStore;

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
        DeletedExpoEntity,
        SurveyEntity,
        SurveyDrawResultEntity,
        SurveyPublicAnswerEntity,
        SurveyAnswerSubmissionEntity,
      ],
      namingStrategy,
      synchronize: true,
      extra: { max: 30 },
    });
    await dataSource.initialize();
    // 운영에서는 마이그레이션이 남겨 둔 시퀀스다. synchronize는 엔티티에 없는 시퀀스를 만들지 않는다.
    await dataSource.query('CREATE SEQUENCE "dynamic_survey_id_seq"');

    surveyStore = new SurveyStore(
      dataSource.getRepository(SurveyEntity),
      dataSource,
      new DeletedExpoStore(),
    );
    submissionStore = new SurveyAnswerSubmissionStore(
      dataSource.getRepository(SurveyAnswerSubmissionEntity),
      dataSource,
    );
    answerStore = new SurveyPublicAnswerStore(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  async function seed(): Promise<SurveyEntity> {
    return surveyStore.save(
      Object.assign(new SurveyEntity(), {
        expoId: randomUUID(),
        title: '설문',
        informationText: '안내',
        participationType: ParticipationType.STANDARD,
        totalAnswers: 0,
        lotteryEnabled: false,
        lotteryNumbers: [],
        lotterySequence: 0,
      }),
      [question('만족도')],
    );
  }

  let phoneSequence = 0;
  function submission(
    survey: SurveyEntity,
    phoneNumber = `0101${String((phoneSequence += 1)).padStart(7, '0')}`,
  ): SurveyAnswerSubmissionEntity {
    return Object.assign(new SurveyAnswerSubmissionEntity(), {
      surveyId: survey.id,
      expoId: survey.expoId,
      participationType: ParticipationType.STANDARD,
      phoneNumber,
      eventId: randomUUID(),
      status: SurveyAnswerSubmissionStatus.RECEIVED,
      payload: { answers: {}, personalInformationStatus: true },
    });
  }

  const submissionCount = async (surveyId: string) =>
    dataSource
      .getRepository(SurveyAnswerSubmissionEntity)
      .countBy({ surveyId });

  /** 이 DB에서 잠금을 기다리는 세션이 `count`개가 될 때까지 기다린다. */
  async function waitForLockWaiters(count: number): Promise<void> {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const [{ waiting }] = await dataSource.query<Array<{ waiting: number }>>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (waiting >= count) {
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(10);
    }
  }

  /**
   * 같은 번호의 활성 접수를 커밋하지 않고 넣어 둔다. 그 번호로 들어온 `createReceived`는 설문 행을 KEY SHARE로 잡은 뒤
   * 활성 제출 유니크 검사에서 이 트랜잭션을 기다리므로, 실제 접수 코드가 설문 행 잠금을 쥔 채 멈춰 있게 된다.
   */
  async function holdPhoneNumber(
    survey: SurveyEntity,
    phoneNumber: string,
  ): Promise<QueryRunner> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.manager.insert(
      SurveyAnswerSubmissionEntity,
      submission(survey, phoneNumber),
    );
    return runner;
  }

  it('삭제가 먼저 설문 행을 잡으면 접수는 기다렸다가 기록하지 않는다', async () => {
    const survey = await seed();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('DELETE FROM survey WHERE id = $1', [survey.id]);

    const created = submissionStore.createReceived(submission(survey));
    await waitForLockWaiters(1);
    await runner.commitTransaction();
    await runner.release();

    await expect(created).resolves.toBe(false);
    expect(await submissionCount(survey.id)).toBe(0);
  });

  it('접수가 먼저 설문 행을 잡으면 삭제가 커밋을 기다렸다가 방금 남긴 기록까지 지운다', async () => {
    const survey = await seed();
    const runner = await holdPhoneNumber(survey, '01099990001');

    const created = submissionStore.createReceived(
      submission(survey, '01099990001'),
    );
    await waitForLockWaiters(1);
    const deleted = surveyStore.deleteById(survey.id);
    await waitForLockWaiters(2);
    await runner.rollbackTransaction();
    await runner.release();

    await expect(created).resolves.toBe(true);
    await deleted;
    expect(
      await dataSource.getRepository(SurveyEntity).existsBy({ id: survey.id }),
    ).toBe(false);
    expect(await submissionCount(survey.id)).toBe(0);
  });

  it('응답 수는 공개 링크 답변과 거절되지 않은 접수를 더하고, 같은 거절이 두 번 와도 한 번만 뺀다', async () => {
    const survey = await seed();
    await answerStore.create(survey.id, {}, Occupation.GENERAL, null);
    const rejected = submission(survey);
    await submissionStore.createReceived(rejected);
    await submissionStore.createReceived(submission(survey));

    await expect(
      submissionStore.markFinal(
        rejected.eventId,
        SurveyAnswerSubmissionStatus.REJECTED,
        '미등록',
      ),
    ).resolves.toBe(true);
    await expect(
      submissionStore.markFinal(
        rejected.eventId,
        SurveyAnswerSubmissionStatus.REJECTED,
        '미등록',
      ),
    ).resolves.toBe(false);

    await expect(surveyStore.countAnswers(survey.id)).resolves.toBe(2);
  });

  it('로그인/SMS 접수만 있는 설문도 문항 교체를 막는다', async () => {
    const survey = await seed();
    await submissionStore.createReceived(submission(survey));

    await expect(
      surveyStore.updateWithQuestions(survey, [question('바뀐 문항')]),
    ).rejects.toBeInstanceOf(SurveyAlreadyAnsweredException);
  });

  it('문항 교체가 설문 행 잠금을 기다리는 사이 커밋된 접수도 세어 교체를 막는다', async () => {
    const survey = await seed();
    const runner = await holdPhoneNumber(survey, '01099990002');

    const created = submissionStore.createReceived(
      submission(survey, '01099990002'),
    );
    await waitForLockWaiters(1);
    const updated = surveyStore.updateWithQuestions(survey, [
      question('바뀐 문항'),
    ]);
    await waitForLockWaiters(2);
    await runner.rollbackTransaction();
    await runner.release();

    await expect(created).resolves.toBe(true);
    await expect(updated).rejects.toBeInstanceOf(
      SurveyAlreadyAnsweredException,
    );
  });

  it('한 설문에 동시에 들어온 접수를 모두 센다', async () => {
    const survey = await seed();
    const total = 20;

    const results = await Promise.all(
      Array.from({ length: total }, async () =>
        submissionStore.createReceived(submission(survey)),
      ),
    );

    expect(results.every(Boolean)).toBe(true);
    await expect(surveyStore.countAnswers(survey.id)).resolves.toBe(total);
  });
});
