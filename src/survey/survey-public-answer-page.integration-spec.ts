import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DomainExceptionFilter } from '../common/exceptions/domain-exception.filter.js';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { publicSurveyAnswerPageSchema } from './dto/public-survey-answer-page.response.dto.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyGiftClaimEntity } from './entities/survey-gift-claim.entity.js';
import { SurveyGiftPinEntity } from './entities/survey-gift-pin.entity.js';
import { SurveyLotteryParticipantEntity } from './entities/survey-lottery-participant.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { InternalSurveyController } from './internal-survey.controller.js';
import { encodeCursor } from './public-answer-cursor.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
import { SurveyPublicController } from './survey-public.controller.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

const adminUrl = process.env.DATABASE_URL;
const TOKEN = 'synthetic-internal-token-for-tests-0000';

describe.skipIf(adminUrl === undefined)(
  '공개 설문 응답 커서 조회 HTTP / PostgreSQL (#215)',
  () => {
    const dbName = `public_page_${randomUUID().replaceAll('-', '')}`;
    let admin: DataSource;
    let dataSource: DataSource;
    let answerStore: SurveyPublicAnswerStore;
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
          DynamicSurveyEntity,
          SurveyDrawResultEntity,
          SurveyPublicAnswerEntity,
          SurveyLotteryParticipantEntity,
          SurveyGiftPinEntity,
          SurveyGiftClaimEntity,
        ],
        synchronize: true,
      });
      await dataSource.initialize();
      answerStore = new SurveyPublicAnswerStore(dataSource);
      const publicService = new SurveyPublicService(
        new SurveyStore(
          dataSource.getRepository(SurveyEntity),
          dataSource,
          new DeletedExpoStore(),
        ),
        answerStore,
      );
      const module = await Test.createTestingModule({
        controllers: [SurveyPublicController, InternalSurveyController],
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

    /** EXCEL-QA 모양의 합성 설문: 문장형·체크박스(선택)·드롭다운(선택). */
    async function seed(participationType = ParticipationType.STANDARD) {
      return dataSource.getRepository(SurveyEntity).save({
        expoId: randomUUID(),
        title: '합성 공개 설문',
        informationText: '안내',
        participationType,
        dynamicSurveys: [
          {
            title: '소감',
            formType: DynamicFormFieldType.SENTENCE,
            requiredStatus: true,
            jsonData: {},
            otherJson: null,
          },
          {
            title: '재방문',
            formType: DynamicFormFieldType.CHECKBOX,
            requiredStatus: false,
            jsonData: {},
            otherJson: null,
          },
          {
            title: '만족도',
            formType: DynamicFormFieldType.DROPDOWN,
            requiredStatus: false,
            jsonData: { '1': '좋음', '2': '보통' },
            otherJson: null,
          },
        ],
      });
    }

    async function questionIds(surveyId: string) {
      const questions = await dataSource
        .getRepository(DynamicSurveyEntity)
        .find({ where: { survey: { id: surveyId } }, order: { id: 'ASC' } });
      return questions.map((question) => String(question.id));
    }

    async function submit(
      expoId: string,
      answers: Record<string, unknown>,
      occupation = Occupation.GENERAL,
    ) {
      await request(app.getHttpServer())
        .post(`/surveys/answer/public/${expoId}`)
        .send({ answers, occupation })
        .expect(200);
    }

    function page(expoId: string, query: Record<string, string> = {}) {
      return request(app.getHttpServer())
        .get(`/internal/surveys/${expoId}/public-answers`)
        .set('X-Internal-Token', TOKEN)
        .query(query);
    }

    async function readPage(expoId: string, query: Record<string, string>) {
      const response = await page(expoId, query).expect(200);
      return publicSurveyAnswerPageSchema.strict().parse(response.body);
    }

    async function readAll(expoId: string, limit: string) {
      const pages = [];
      let cursor: string | null = null;
      do {
        // eslint-disable-next-line no-await-in-loop -- 커서가 앞 페이지 응답에 달려 있어 차례로 읽어야 한다.
        const body = await readPage(expoId, {
          limit,
          ...(cursor !== null && { cursor }),
        });
        pages.push(body);
        cursor = body.nextCursor;
      } while (cursor !== null);

      return pages;
    }

    it('교원/일반 응답의 true/false·줄바꿈·선택 문항 미응답을 그대로 주고 반복 응답을 지우지 않는다', async () => {
      const survey = await seed();
      const [sentence, checkbox, dropdown] = await questionIds(survey.id);
      await submit(
        survey.expoId,
        {
          [sentence]: 'EXCEL-QA 교원\n둘째 줄',
          [checkbox]: true,
          [dropdown]: '1',
        },
        Occupation.TEACHER,
      );
      await submit(survey.expoId, {
        [sentence]: 'EXCEL-QA 일반',
        [checkbox]: false,
        [dropdown]: null,
      });
      await submit(survey.expoId, {
        [sentence]: 'EXCEL-QA 일반',
        [checkbox]: false,
      });

      const [body] = await readAll(survey.expoId, '10');

      expect(body).toMatchObject({
        survey: {
          id: survey.id,
          expoId: survey.expoId,
          title: '합성 공개 설문',
        },
        questionDefinition: 'CURRENT',
        totalCount: 3,
        nextCursor: null,
      });
      expect(
        body.questions.map((question) => [question.id, question.order]),
      ).toEqual([
        [Number(sentence), 0],
        [Number(checkbox), 1],
        [Number(dropdown), 2],
      ]);
      expect(
        body.answers.map((answer) => [answer.occupation, answer.answers]),
      ).toEqual([
        [
          Occupation.TEACHER,
          {
            [sentence]: 'EXCEL-QA 교원\n둘째 줄',
            [checkbox]: true,
            [dropdown]: '1',
          },
        ],
        [
          Occupation.GENERAL,
          { [sentence]: 'EXCEL-QA 일반', [checkbox]: false },
        ],
        [
          Occupation.GENERAL,
          { [sentence]: 'EXCEL-QA 일반', [checkbox]: false },
        ],
      ]);
      expect(new Set(body.answers.map((answer) => answer.id)).size).toBe(3);
      // 익명 응답 행에는 응답 id·시각·직업·답변만 있다.
      expect(Object.keys(body.answers[0]).toSorted()).toEqual([
        'answers',
        'createdAt',
        'id',
        'occupation',
      ]);
    });

    it('응답 0건은 빈 페이지, 설문 없는 박람회와 교육생 설문만 있는 박람회는 404다', async () => {
      const survey = await seed();
      const trainee = await seed(ParticipationType.TRAINEE);

      const [empty] = await readAll(survey.expoId, '10');
      expect(empty).toMatchObject({
        totalCount: 0,
        answers: [],
        nextCursor: null,
      });
      expect(empty.questions).toHaveLength(3);

      for (const expoId of [randomUUID(), trainee.expoId]) {
        // eslint-disable-next-line no-await-in-loop -- 두 경우를 차례로 확인한다.
        const response = await page(expoId).expect(404);
        expect(response.body).toMatchObject({ code: 'SURVEY_NOT_FOUND' });
      }
    });

    it('내부 토큰이 없거나 틀리면 401이다', async () => {
      const survey = await seed();
      await request(app.getHttpServer())
        .get(`/internal/surveys/${survey.expoId}/public-answers`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/internal/surveys/${survey.expoId}/public-answers`)
        .set('X-Internal-Token', `${TOKEN}x`)
        .expect(401);
    });

    it('limit 범위 밖과 잘못된 expoId는 400이다', async () => {
      const survey = await seed();
      await page(survey.expoId, { limit: '0' }).expect(400);
      await page(survey.expoId, { limit: '1001' }).expect(400);
      await page('not-a-uuid').expect(400);
    });

    it('동일 시각 응답과 페이지 경계에서 빠지거나 겹치지 않는다', async () => {
      const survey = await seed();
      const [sentence] = await questionIds(survey.id);
      const sameTime = '2026-10-21 01:00:00.000001+00';
      for (let index = 0; index < 5; index++) {
        // eslint-disable-next-line no-await-in-loop -- 순서대로 넣는다.
        await dataSource.query(
          `INSERT INTO survey_public_answer (survey_id, answers, occupation, created_at) VALUES ($1, $2, 'GENERAL', $3)`,
          [survey.id, { [sentence]: `동시각 ${index}` }, sameTime],
        );
      }

      await submit(survey.expoId, { [sentence]: '나중' });

      for (const limit of ['1', '2', '3', '6']) {
        // eslint-disable-next-line no-await-in-loop -- limit마다 처음부터 끝까지 읽는다.
        const pages = await readAll(survey.expoId, limit);
        const ids = pages.flatMap((body) =>
          body.answers.map((answer) => answer.id),
        );

        expect(new Set(ids).size).toBe(6);
        expect(pages.every((body) => body.totalCount === 6)).toBe(true);
        // 정확히 limit개로 끝나는 마지막 페이지 뒤에 빈 페이지를 더 요구하지 않는다.
        expect(pages).toHaveLength(Math.ceil(6 / Number(limit)));
        expect(pages.at(-1)?.answers.at(-1)?.answers).toEqual({
          [sentence]: '나중',
        });
      }
    });

    it('첫 페이지 뒤에 들어온 제출은 상한 밖이라 같은 조회에 섞이지 않고, 새 조회에는 들어온다', async () => {
      const survey = await seed();
      const [sentence] = await questionIds(survey.id);
      for (let index = 0; index < 3; index++) {
        // eslint-disable-next-line no-await-in-loop -- 순서대로 제출한다.
        await submit(survey.expoId, { [sentence]: `기존 ${index}` });
      }

      const first = await readPage(survey.expoId, { limit: '2' });
      await Promise.all([
        submit(survey.expoId, { [sentence]: '동시 1' }),
        submit(survey.expoId, { [sentence]: '동시 2' }),
      ]);
      const second = await readPage(survey.expoId, {
        limit: '2',
        cursor: first.nextCursor ?? '',
      });

      expect(second.snapshotAt).toBe(first.snapshotAt);
      expect(second.totalCount).toBe(3);
      expect(second.nextCursor).toBeNull();
      expect(
        [...first.answers, ...second.answers].map(
          (answer) => answer.answers[sentence],
        ),
      ).toEqual(['기존 0', '기존 1', '기존 2']);

      const fresh = await readAll(survey.expoId, '10');
      expect(fresh[0].totalCount).toBe(5);
    });

    it('상한은 진행 중인 제출이 커밋되길 기다린 뒤 정해진다', async () => {
      const survey = await seed();
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      // 제출이 설문 행을 잠그고 응답을 넣은 채 아직 커밋하지 않은 상태
      await runner.query(
        `SELECT id FROM survey WHERE id = $1 FOR NO KEY UPDATE`,
        [survey.id],
      );
      await runner.query(
        `INSERT INTO survey_public_answer (survey_id, answers, occupation, created_at) VALUES ($1, '{}', 'GENERAL', clock_timestamp())`,
        [survey.id],
      );

      const snapshot = answerStore.snapshot(survey.id);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      const [{ released }] = (await runner.query(
        `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS released`,
      )) as Array<{ released: string }>;
      await runner.commitTransaction();
      await runner.release();

      const snapshotAt = await snapshot;
      expect(snapshotAt > released).toBe(true);
      const pageResult = await answerStore.findPage(
        survey.id,
        snapshotAt,
        null,
        10,
      );
      expect(pageResult.totalCount).toBe(1);
    });

    it('제출 시각은 설문 행 잠금을 얻은 뒤의 시각이다 (트랜잭션 시작 시각이 아니다)', async () => {
      const survey = await seed();
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      await runner.query(`SELECT id FROM survey WHERE id = $1 FOR UPDATE`, [
        survey.id,
      ]);

      const created = answerStore.create(
        survey.id,
        {},
        Occupation.GENERAL,
        null,
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      const [{ released }] = (await runner.query(
        `SELECT clock_timestamp() AS released`,
      )) as Array<{ released: string }>;
      await runner.commitTransaction();
      await runner.release();
      await created;

      const [{ late }] = await dataSource.query<Array<{ late: boolean }>>(
        `SELECT created_at >= $2::timestamptz AS late FROM survey_public_answer WHERE survey_id = $1`,
        [survey.id, released],
      );
      expect(late).toBe(true);
    });

    it('위조·다른 설문·다른 박람회·미래 상한 커서는 400 SURVEY_CURSOR_INVALID다', async () => {
      const survey = await seed();
      const other = await seed();
      const past = '2026-01-01T00:00:00.000000Z';
      const future = '2999-01-01T00:00:00.000000Z';
      const cursors = [
        'not-base64-json',
        Buffer.from('{"surveyId":1}').toString('base64url'),
        encodeCursor({
          surveyId: other.id,
          snapshotAt: past,
          createdAt: past,
          id: randomUUID(),
        }),
        encodeCursor({
          surveyId: survey.id,
          snapshotAt: future,
          createdAt: past,
          id: randomUUID(),
        }),
        encodeCursor({
          surveyId: survey.id,
          snapshotAt: past,
          createdAt: '2026-02-01T00:00:00.000000Z',
          id: randomUUID(),
        }),
      ];

      for (const cursor of cursors) {
        // eslint-disable-next-line no-await-in-loop -- 커서마다 확인한다.
        const response = await page(survey.expoId, { cursor }).expect(400);
        expect(response.body).toMatchObject({ code: 'SURVEY_CURSOR_INVALID' });
      }

      // 다른 박람회 설문에서 받은 진짜 커서도 거절한다.
      const [sentence] = await questionIds(other.id);
      await submit(other.expoId, { [sentence]: 'a' });
      await submit(other.expoId, { [sentence]: 'b' });
      const real = await readPage(other.expoId, { limit: '1' });
      await page(survey.expoId, { cursor: real.nextCursor ?? '' }).expect(400);
    });
  },
);
