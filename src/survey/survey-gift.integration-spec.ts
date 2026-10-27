import { randomUUID } from 'node:crypto';
import process from 'node:process';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DomainExceptionFilter } from '../common/exceptions/domain-exception.filter.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyGiftClaimEntity } from './entities/survey-gift-claim.entity.js';
import { SurveyGiftPinEntity } from './entities/survey-gift-pin.entity.js';
import { SurveyLotteryParticipantEntity } from './entities/survey-lottery-participant.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyGiftController } from './survey-gift.controller.js';
import { SurveyGiftService } from './survey-gift.service.js';
import { SurveyGiftStore } from './survey-gift.store.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
import { SurveyPublicController } from './survey-public.controller.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyStore } from './survey.store.js';

const adminUrl = process.env.DATABASE_URL;

describe.skipIf(adminUrl === undefined)(
  '기념품 수령 확인 HTTP / PostgreSQL',
  () => {
    const dbName = `gift_pickup_${randomUUID().replaceAll('-', '')}`;
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
          SurveyLotteryParticipantEntity,
          SurveyGiftPinEntity,
          SurveyGiftClaimEntity,
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
        controllers: [SurveyPublicController, SurveyGiftController],
        providers: [
          {
            provide: SurveyPublicService,
            useValue: new SurveyPublicService(
              surveyStore,
              new SurveyPublicAnswerStore(dataSource),
            ),
          },
          {
            provide: SurveyGiftService,
            useValue: new SurveyGiftService(
              surveyStore,
              new SurveyGiftStore(dataSource),
            ),
          },
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

    async function seed() {
      return dataSource.getRepository(SurveyEntity).save({
        expoId: randomUUID(),
        title: '공개 설문',
        informationText: '안내',
        participationType: ParticipationType.STANDARD,
      });
    }

    async function submit(expoId: string): Promise<string> {
      const response = await request(app.getHttpServer())
        .post(`/surveys/answer/public/${expoId}`)
        .send({ answers: {}, occupation: Occupation.GENERAL })
        .expect(200);
      return (response.body as { giftToken: string }).giftToken;
    }

    const setPin = (expoId: string, pin: string) =>
      request(app.getHttpServer())
        .put(`/surveys/${expoId}/gift-pin`)
        .send({ pin });

    const confirm = (expoId: string, token: string, pin: string) =>
      request(app.getHttpServer())
        .post(`/surveys/${expoId}/gift-pickup/confirm`)
        .send({ token, pin });

    const status = (expoId: string, token: string) =>
      request(app.getHttpServer())
        .post(`/surveys/${expoId}/gift-pickup/status`)
        .send({ token });

    it('제출마다 토큰을 발급하고 DB에는 해시만 남으며 응답과 수령 기록이 1:1이다', async () => {
      const survey = await seed();

      const first = await submit(survey.expoId);
      const second = await submit(survey.expoId);

      expect(first).not.toBe(second);
      const claims = await dataSource
        .getRepository(SurveyGiftClaimEntity)
        .findBy({ surveyId: survey.id });
      expect(claims).toHaveLength(2);
      expect(claims.map((claim) => claim.tokenHash)).not.toContain(first);
      expect(
        await dataSource
          .getRepository(SurveyPublicAnswerEntity)
          .countBy({ surveyId: survey.id }),
      ).toBe(2);
    });

    it('미수령 상태를 조회하고 응답은 캐시하지 않으며 다른 정보는 싣지 않는다', async () => {
      const survey = await seed();
      const token = await submit(survey.expoId);

      const response = await status(survey.expoId, token).expect(200);

      expect(response.body).toEqual({
        claimed: false,
        claimedAt: null,
        pinConfigured: false,
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('PIN을 설정하기 전에는 확인할 수 없고, 설정 여부만 조회된다', async () => {
      const survey = await seed();
      const token = await submit(survey.expoId);

      const unset = await confirm(survey.expoId, token, '1234').expect(409);
      expect(unset.body).toMatchObject({ code: 'GIFT_PIN_NOT_CONFIGURED' });

      const saved = await setPin(survey.expoId, '1234').expect(200);
      expect(saved.body).toEqual({ configured: true });
      expect(saved.headers['cache-control']).toBe('no-store');
      const pin = await dataSource
        .getRepository(SurveyGiftPinEntity)
        .findOneByOrFail({ surveyId: survey.id });
      expect(pin.pinHash).not.toContain('1234');
    });

    it('PIN 형식이 틀리면 400이다', async () => {
      const survey = await seed();

      await setPin(survey.expoId, '12').expect(400);
      await setPin(survey.expoId, 'abcd').expect(400);
    });

    it('틀린 PIN으로는 완료되지 않고, 맞는 PIN으로 완료하면 이후 다시 확인해도 같은 완료 상태다', async () => {
      const survey = await seed();
      const token = await submit(survey.expoId);
      await setPin(survey.expoId, '1234').expect(200);

      const wrong = await confirm(survey.expoId, token, '9999').expect(403);
      expect(wrong.body).toMatchObject({
        code: 'GIFT_PIN_INVALID',
        attemptsLeft: 4,
      });
      const pending = await status(survey.expoId, token);
      expect(pending.body).toMatchObject({ claimed: false });

      const done = await confirm(survey.expoId, token, '1234').expect(200);
      expect(done.body).toMatchObject({ claimed: true });
      // 이미 완료된 건은 PIN이 틀려도 같은 완료 상태를 돌려주고 시각이 바뀌지 않는다
      const again = await confirm(survey.expoId, token, '0000').expect(200);
      expect(again.body).toEqual(done.body);
      const finished = await status(survey.expoId, token);
      expect(finished.body).toEqual(done.body);
    });

    it('같은 토큰으로 동시에 확인해도 한 번만 완료한다', async () => {
      const survey = await seed();
      const token = await submit(survey.expoId);
      await setPin(survey.expoId, '1234').expect(200);

      const responses = await Promise.all(
        Array.from({ length: 6 }, async () =>
          confirm(survey.expoId, token, '1234'),
        ),
      );

      expect(responses.every((response) => response.status === 200)).toBe(true);
      const times = responses.map(
        (response) => (response.body as { claimedAt: string }).claimedAt,
      );
      expect(new Set(times).size).toBe(1);
    });

    it('한 토큰에서 PIN을 연속으로 틀리면 그 토큰만 잠기고 다른 참가자의 확인은 막히지 않는다', async () => {
      const survey = await seed();
      const locked = await submit(survey.expoId);
      const other = await submit(survey.expoId);
      await setPin(survey.expoId, '1234').expect(200);

      // 연속 오입력은 순서대로 쌓이는 횟수라 한 번씩 차례로 보낸다
      /* eslint-disable no-await-in-loop -- 오입력 횟수는 순서대로 쌓인다 */
      for (let i = 0; i < 4; i++) {
        await confirm(survey.expoId, locked, '0000').expect(403);
      }
      /* eslint-enable no-await-in-loop -- 반복문 구간 끝 */

      const fifth = await confirm(survey.expoId, locked, '0000').expect(429);
      expect(fifth.body).toMatchObject({
        code: 'GIFT_PIN_LOCKED',
        retryAfterSeconds: 300,
      });
      expect(fifth.headers['retry-after']).toBe('300');
      // 잠긴 동안은 맞는 PIN도 받지 않는다(자동 대입 방지)
      await confirm(survey.expoId, locked, '1234').expect(429);
      // 다른 토큰은 그대로 확인된다 — 전역 잠금이 아니다
      await confirm(survey.expoId, other, '1234').expect(200);
    });

    it('PIN을 바꾸면 옛 PIN은 통하지 않고 이미 발급된 토큰은 새 PIN으로 쓸 수 있다', async () => {
      const survey = await seed();
      const token = await submit(survey.expoId);
      await setPin(survey.expoId, '1111').expect(200);
      await setPin(survey.expoId, '2222').expect(200);

      await confirm(survey.expoId, token, '1111').expect(403);
      await confirm(survey.expoId, token, '2222').expect(200);
    });

    it('다른 박람회의 토큰·PIN은 섞어 쓸 수 없다', async () => {
      const a = await seed();
      const b = await seed();
      const tokenOfA = await submit(a.expoId);
      await setPin(a.expoId, '1234').expect(200);
      await setPin(b.expoId, '5678').expect(200);

      const mixed = await confirm(b.expoId, tokenOfA, '5678').expect(404);
      expect(mixed.body).toMatchObject({ code: 'GIFT_PICKUP_TOKEN_INVALID' });
      await status(b.expoId, tokenOfA).expect(404);
      await confirm(a.expoId, tokenOfA, '5678').expect(403);
      await confirm(a.expoId, 'nonexistent', '1234').expect(404);
    });

    it('수령 기록이 없는 기존 응답과 함께 있어도 영향이 없다', async () => {
      const survey = await seed();
      await dataSource.getRepository(SurveyPublicAnswerEntity).insert({
        surveyId: survey.id,
        answers: {},
        occupation: Occupation.GENERAL,
      });

      const token = await submit(survey.expoId);

      await status(survey.expoId, token).expect(200);
      expect(
        await dataSource
          .getRepository(SurveyGiftClaimEntity)
          .countBy({ surveyId: survey.id }),
      ).toBe(1);
    });

    it('설문이 지워지면 PIN과 수령 기록도 함께 지워진다', async () => {
      const survey = await seed();
      await submit(survey.expoId);
      await setPin(survey.expoId, '1234').expect(200);

      await dataSource.getRepository(SurveyEntity).delete({ id: survey.id });

      expect(
        await dataSource
          .getRepository(SurveyGiftClaimEntity)
          .countBy({ surveyId: survey.id }),
      ).toBe(0);
      expect(
        await dataSource
          .getRepository(SurveyGiftPinEntity)
          .countBy({ surveyId: survey.id }),
      ).toBe(0);
    });
  },
);
