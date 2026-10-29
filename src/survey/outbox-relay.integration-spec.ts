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
import { DEFAULT_RELAY_SETTINGS } from './survey-answer-relay.config.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyDrawResultStore } from './survey-draw-result.store.js';

/**
 * Outbox 릴레이의 "같은 행을 두 번 발행하지 않는다"를 실제 Postgres의 `FOR UPDATE SKIP LOCKED`로 확인한다.
 * 단위 테스트의 mock으로는 잠금이 보이지 않아서 따로 둔다. `DATABASE_URL`의 서버에 임시 DB를 만들고 끝나면 지운다.
 *
 * 실행: `docker compose up -d db` 후 `DATABASE_URL=... pnpm test:integration`
 */
const adminUrl = process.env.DATABASE_URL;

describe.skipIf(adminUrl === undefined)('Outbox 릴레이 중복 발행 방지', () => {
  const dbName = `relay_it_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let drawStore: SurveyDrawResultStore;
  let answerStore: SurveyAnswerSubmissionStore;
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

    drawStore = new SurveyDrawResultStore(
      dataSource.getRepository(SurveyDrawResultEntity),
      dataSource,
    );
    answerStore = new SurveyAnswerSubmissionStore(
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

  const delay = async (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  async function seedDrawResults(count: number, retryCount = 0) {
    const repository = dataSource.getRepository(SurveyDrawResultEntity);
    await repository.clear();
    const rows = Array.from({ length: count }, (_, index) =>
      repository.create({
        surveyId,
        eventId: randomUUID(),
        drawNumber: index + 1,
        phoneNumber: '01012345678',
        retryCount,
      }),
    );
    await repository.insert(rows.map((row) => ({ ...row })));
  }

  it('두 릴레이가 동시에 돌아도 당첨 결과를 한 번씩만 발행한다', async () => {
    await seedDrawResults(6);
    const published: string[] = [];
    const publish = async (result: SurveyDrawResultEntity) => {
      // 잠금을 쥔 채 오래 걸리는 발행을 흉내 낸다. 이 사이 다른 릴레이가 같은 행을 읽으면 중복이 난다.
      await delay(150);
      published.push(result.id);
    };

    await Promise.all([
      drawStore.relayUnpublished(100, 100, publish),
      drawStore.relayUnpublished(100, 100, publish),
    ]);

    expect(published).toHaveLength(6);
    expect(new Set(published).size).toBe(6);
    const rows = await dataSource.getRepository(SurveyDrawResultEntity).find();
    expect(rows.every((row) => row.publishedAt !== null)).toBe(true);
  });

  it('발행에 성공하면 표시하고, 다음 실행에서는 다시 보내지 않는다', async () => {
    await seedDrawResults(2);
    let calls = 0;
    const publish = async () => {
      calls += 1;
    };

    await drawStore.relayUnpublished(100, 100, publish);
    await drawStore.relayUnpublished(100, 100, publish);

    expect(calls).toBe(2);
  });

  it('실패하면 실패 횟수를 올리고, 상한에 닿은 건은 더 읽지 않는다', async () => {
    await seedDrawResults(1);
    const fail = async () => {
      throw new Error('broker unreachable');
    };

    const first = await drawStore.relayUnpublished(100, 2, fail);
    const second = await drawStore.relayUnpublished(100, 2, fail);
    const third = await drawStore.relayUnpublished(100, 2, fail);

    expect(first.map((failure) => failure.retryCount)).toEqual([1]);
    expect(second.map((failure) => failure.retryCount)).toEqual([2]);
    expect(third).toEqual([]);
  });

  it('상한에 닿은 건이 배치 앞을 차지해도 뒤의 정상 건이 발행된다', async () => {
    await seedDrawResults(3);
    const repository = dataSource.getRepository(SurveyDrawResultEntity);
    const [first] = await repository.find({ order: { createdAt: 'ASC' } });
    await repository.update(first.id, { retryCount: 5 });
    const published: string[] = [];

    // 배치 크기 1이어도 포기한 건이 자리를 차지하지 않는다.
    await drawStore.relayUnpublished(1, 5, async (result) => {
      published.push(result.id);
    });

    expect(published).toHaveLength(1);
    expect(published).not.toContain(first.id);
  });

  it('발행할 결과에 설문의 박람회 id를 함께 싣는다', async () => {
    await seedDrawResults(1);
    const expoIds: string[] = [];

    await drawStore.relayUnpublished(100, 100, async (result) => {
      expoIds.push(result.survey.expoId);
    });

    expect(expoIds).toEqual([expoId]);
  });

  it('설문 행이 다른 트랜잭션에 잠겨 있어도 그 설문의 결과를 건너뛰지 않는다', async () => {
    await seedDrawResults(1);
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // 공개 답변 제출이 당첨 판정 동안 설문 행을 잠그는 상황을 흉내 낸다.
      await runner.query('SELECT id FROM survey WHERE id = $1 FOR UPDATE', [
        surveyId,
      ]);
      let calls = 0;

      await drawStore.relayUnpublished(100, 100, async () => {
        calls += 1;
      });

      expect(calls).toBe(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('설문 답변 릴레이도 두 인스턴스가 같은 접수 건을 중복 발행하지 않는다', async () => {
    const repository = dataSource.getRepository(SurveyAnswerSubmissionEntity);
    await repository.clear();
    for (let index = 0; index < 4; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repository.insert({
        surveyId,
        eventId: randomUUID(),
        expoId: randomUUID(),
        participationType: ParticipationType.STANDARD,
        phoneNumber: `0101234567${index}`,
        status: SurveyAnswerSubmissionStatus.RECEIVED,
        payload: { answers: {}, personalInformationStatus: true },
      });
    }

    const published: string[] = [];
    const publish = async (batch: SurveyAnswerSubmissionEntity[]) => {
      await delay(150);
      published.push(...batch.map((submission) => submission.id));
      return {
        published: batch.map((submission) => ({
          submission,
          version: 1 as const,
        })),
        failures: [],
      };
    };

    const options = {
      ...DEFAULT_RELAY_SETTINGS,
      now: new Date(),
      limit: 100,
    };

    await Promise.all([
      answerStore.relayPending(options, publish),
      answerStore.relayPending(options, publish),
    ]);

    expect(published).toHaveLength(4);
    expect(new Set(published).size).toBe(4);
    const rows = await repository.find();
    expect(
      rows.every(
        (row) => row.status === SurveyAnswerSubmissionStatus.PUBLISHED,
      ),
    ).toBe(true);
    // 두 번 발행됐다면 retryCount가 2가 된다.
    expect(rows.map((row) => row.retryCount)).toEqual([1, 1, 1, 1]);
  });

  it('발행하는 동안 행을 잠그지 않아 결과 반영이 기다리지 않고, 실패한 건은 claim 전으로 되돌린다', async () => {
    const repository = dataSource.getRepository(SurveyAnswerSubmissionEntity);
    await repository.clear();
    const eventIds = [randomUUID(), randomUUID()];
    for (const [index, eventId] of eventIds.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await repository.insert({
        surveyId,
        eventId,
        expoId: randomUUID(),
        participationType: ParticipationType.STANDARD,
        phoneNumber: `0101234590${index}`,
        status: SurveyAnswerSubmissionStatus.RECEIVED,
        payload: { answers: {}, personalInformationStatus: true },
      });
    }

    let finalizedDuringPublish = false;
    await answerStore.relayPending(
      { ...DEFAULT_RELAY_SETTINGS, now: new Date(), limit: 100 },
      async (batch) => {
        // 발행 중에 결과가 도착한다. 행 잠금을 쥐고 있었다면 relayPending이 끝날 때까지 여기서 멈춘다.
        finalizedDuringPublish = await answerStore.markFinal(
          eventIds[0],
          SurveyAnswerSubmissionStatus.STORED,
          null,
        );
        const [sent, failed] = [
          batch.filter((item) => item.eventId === eventIds[0]),
          batch.filter((item) => item.eventId !== eventIds[0]),
        ];
        return {
          published: sent.map((submission) => ({
            submission,
            version: 2 as const,
          })),
          failures: failed.map((submission) => ({
            submission,
            error: new Error('broker down'),
          })),
        };
      },
    );

    expect(finalizedDuringPublish).toBe(true);
    const stored = await repository.findOneByOrFail({ eventId: eventIds[0] });
    expect(stored).toMatchObject({
      status: SurveyAnswerSubmissionStatus.STORED,
      retryCount: 1,
      eventVersion: 2,
    });
    const released = await repository.findOneByOrFail({
      eventId: eventIds[1],
    });
    expect(released).toMatchObject({
      status: SurveyAnswerSubmissionStatus.RECEIVED,
      retryCount: 0,
      publishedAt: null,
      eventVersion: null,
    });
  });

  it('재발행은 retryCount가 늘수록 더 오래 기다린 뒤에 다시 잡는다', async () => {
    const repository = dataSource.getRepository(SurveyAnswerSubmissionEntity);
    await repository.clear();
    const minute = 60_000;
    const ids: string[] = [];
    // retryCount 1과 3, 둘 다 마지막 발행이 12분 전이다. 대기는 5분(+지터)과 20분(+지터)이다.
    for (const retryCount of [1, 3]) {
      // eslint-disable-next-line no-await-in-loop
      const { identifiers } = await repository.insert({
        surveyId,
        eventId: randomUUID(),
        expoId: randomUUID(),
        participationType: ParticipationType.STANDARD,
        phoneNumber: `0101234500${retryCount}`,
        status: SurveyAnswerSubmissionStatus.PUBLISHED,
        retryCount,
        publishedAt: new Date(Date.now() - (12 * minute)),
        payload: { answers: {}, personalInformationStatus: true },
      });
      ids.push(String(identifiers[0].id));
    }

    const published: string[] = [];
    await answerStore.relayPending(
      { ...DEFAULT_RELAY_SETTINGS, now: new Date(), limit: 100 },
      async (batch) => {
        published.push(...batch.map((submission) => submission.id));
        return {
          published: batch.map((submission) => ({
            submission,
            version: 1 as const,
          })),
          failures: [],
        };
      },
    );

    expect(published).toEqual([ids[0]]);
  });
});
