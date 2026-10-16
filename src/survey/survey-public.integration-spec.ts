import { randomUUID } from 'node:crypto';
import process from 'node:process';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { publicSurveyAnswerResponseSchema } from './dto/public-survey-answer.response.dto.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
import { SurveyPublicController } from './survey-public.controller.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyStore } from './survey.store.js';

const adminUrl = process.env.DATABASE_URL;

describe.skipIf(adminUrl === undefined)(
  '공개 설문 추첨 HTTP / PostgreSQL',
  () => {
    const dbName = `public_draw_${randomUUID().replaceAll('-', '')}`;
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
          DynamicSurveyEntity,
          SurveyDrawResultEntity,
          SurveyPublicAnswerEntity,
        ],
        synchronize: true,
      });
      await dataSource.initialize();
      const surveyStore = new SurveyStore(
        dataSource.getRepository(SurveyEntity),
        dataSource,
        new DeletedExpoStore(),
      );
      const module = await Test.createTestingModule({
        controllers: [SurveyPublicController],
        providers: [
          {
            provide: SurveyPublicService,
            useValue: new SurveyPublicService(
              surveyStore,
              new SurveyPublicAnswerStore(dataSource),
            ),
          },
        ],
      }).compile();
      app = module.createNestApplication<INestApplication<Server>>();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      await dataSource?.destroy();
      await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin?.destroy();
    });

    async function seed(numbers = [1, 2, 3], enabled = true) {
      return dataSource.getRepository(SurveyEntity).save({
        expoId: randomUUID(),
        title: '공개 설문',
        informationText: '안내',
        participationType: ParticipationType.STANDARD,
        lotteryEnabled: enabled,
        lotteryNumbers: numbers,
      });
    }

    async function submit(expoId: string, phoneNumber?: string) {
      const response = await request(app.getHttpServer())
        .post(`/surveys/answer/public/${expoId}`)
        .send({
          answers: {},
          occupation: Occupation.GENERAL,
          ...(phoneNumber !== undefined && {
            phoneNumber,
            personalInformationStatus: true,
          }),
        })
        .expect(200);
      return publicSurveyAnswerResponseSchema.strict().parse(response.body);
    }

    it('동시에 같은 정규화 번호로 제출해도 한 번만 당첨되고 순번은 노출하지 않는다', async () => {
      const survey = await seed();

      const responses = await Promise.all([
        submit(survey.expoId, '010-1234-5678'),
        submit(survey.expoId, '010 1234 5678'),
        submit(survey.expoId, '01012345678'),
      ]);

      expect(responses).toEqual(
        expect.arrayContaining([{ won: true }, { won: false }, { won: false }]),
      );
      expect(responses.filter((response) => response.won)).toHaveLength(1);
      expect(
        await dataSource.getRepository(SurveyDrawResultEntity).countBy({
          surveyId: survey.id,
        }),
      ).toBe(1);
      expect(
        await dataSource.getRepository(SurveyPublicAnswerEntity).countBy({
          surveyId: survey.id,
        }),
      ).toBe(3);
      expect(
        await dataSource.getRepository(SurveyEntity).findOneByOrFail({
          id: survey.id,
        }),
      ).toMatchObject({ lotterySequence: 3, totalAnswers: 3 });
    });

    it('기존 당첨 번호의 재당첨을 막고 소비한 순번 다음 번호는 당첨된다', async () => {
      const survey = await seed();
      await dataSource.getRepository(SurveyDrawResultEntity).save({
        eventId: randomUUID(),
        surveyId: survey.id,
        drawNumber: 1,
        phoneNumber: '01012345678',
      });
      await dataSource.getRepository(SurveyEntity).update(survey.id, {
        lotterySequence: 1,
      });

      const duplicate = await submit(survey.expoId, '010-1234-5678');
      const next = await submit(survey.expoId, '01099998888');

      expect(duplicate).toEqual({ won: false });
      expect(next).toEqual({ won: true });
      expect(
        await dataSource.getRepository(SurveyDrawResultEntity).find({
          where: { surveyId: survey.id },
          order: { drawNumber: 'ASC' },
        }),
      ).toMatchObject([{ drawNumber: 1 }, { drawNumber: 3 }]);
    });

    it('당첨되지 않은 번호는 다음 당첨 순번에 당첨된다', async () => {
      const survey = await seed([2]);

      const first = await submit(survey.expoId, '01012345678');
      const second = await submit(survey.expoId, '01012345678');

      expect(first).toEqual({ won: false });
      expect(second).toEqual({ won: true });
    });

    it('같은 번호도 다른 설문에서는 당첨된다', async () => {
      const first = await seed();
      const second = await seed();

      const responses = await Promise.all([
        submit(first.expoId, '01012345678'),
        submit(second.expoId, '01012345678'),
      ]);

      expect(responses).toEqual([{ won: true }, { won: true }]);
    });

    it('번호 없는 응답은 기존처럼 각각 당첨될 수 있다', async () => {
      const survey = await seed();

      const responses = await Promise.all([
        submit(survey.expoId),
        submit(survey.expoId),
      ]);

      expect(responses).toEqual([{ won: true }, { won: true }]);
    });

    it('추첨이 꺼져 있으면 당첨되지 않고 순번도 소비하지 않는다', async () => {
      const survey = await seed([1], false);

      const response = await submit(survey.expoId, '01012345678');

      expect(response).toEqual({ won: false });
      expect(
        await dataSource.getRepository(SurveyEntity).findOneByOrFail({
          id: survey.id,
        }),
      ).toMatchObject({ lotterySequence: 0, totalAnswers: 1 });
    });
  },
);
