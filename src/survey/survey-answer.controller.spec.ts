import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DomainExceptionFilter } from '../common/exceptions/domain-exception.filter.js';
import { HttpUserClient } from '../user-client/http-user-client.js';
import { USER_CLIENT } from '../user-client/user-client.interface.js';
import type { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import {
  readSessionCookie,
  SurveyAnswerController,
} from './survey-answer.controller.js';
import { SurveyAnswerService } from './survey-answer.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyStore } from './survey.store.js';

const EXPO = '11111111-1111-1111-1111-111111111111';
const OTHER_EXPO = '22222222-2222-2222-2222-222222222222';
const PHONE = '01012345678';

const survey = {
  id: 'survey-1',
  expoId: EXPO,
  participationType: ParticipationType.STANDARD,
  dynamicSurveys: [
    {
      id: 1,
      title: '만족도',
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    },
  ],
};

/** 유저 서비스의 참가자 세션 저장소를 흉내 낸다: 세션 ID → 발급된 행사. */
const sessions = new Map([
  ['mine', EXPO],
  ['other-expo', OTHER_EXPO],
]);

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

/** 유저 서비스 내부 API 계약대로 답한다. 다른 행사의 세션은 401 SESSION_REQUIRED다. */
async function fakeUserServer(url: string, init: RequestInit) {
  const body = JSON.parse(init.body as string) as Record<string, string>;
  if (url.endsWith('/internal/participant-sessions/resolve')) {
    return sessions.get(body.sessionId) === body.expoId
      ? json(200, {
          expoId: body.expoId,
          phoneNumber: PHONE,
          expiresAt: new Date(Date.now() + 600_000).toISOString().slice(0, 19),
        })
      : json(401, { status: 401, code: 'SESSION_REQUIRED', message: '' });
  }

  return body.phoneNumber === PHONE
    ? json(200, {
        participantId: 1,
        participationType: ParticipationType.STANDARD,
      })
    : json(404, {});
}

describe('SurveyAnswerController (#147 참가자 세션)', () => {
  let app: INestApplication<Server>;
  let saved: SurveyAnswerSubmissionEntity[];

  beforeEach(async () => {
    saved = [];
    vi.stubGlobal('fetch', vi.fn(fakeUserServer));

    const module = await Test.createTestingModule({
      controllers: [SurveyAnswerController],
      providers: [
        SurveyAnswerService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: USER_CLIENT,
          useValue: new HttpUserClient({
            baseUrl: 'http://user-server',
            internalToken: 'x'.repeat(32),
          }),
        },
        {
          provide: SurveyStore,
          useValue: {
            findByExpoAndType: async (expoId: string) =>
              expoId === EXPO ? survey : null,
          },
        },
        {
          provide: SurveyAnswerSubmissionStore,
          useValue: {
            findActiveByKey: async (surveyId: string, phoneNumber: string) =>
              saved.find(
                (s) =>
                  s.surveyId === surveyId &&
                  s.phoneNumber === phoneNumber &&
                  s.status !== SurveyAnswerSubmissionStatus.REJECTED,
              ) ?? null,
            findLatestByKey: async (surveyId: string, phoneNumber: string) =>
              saved.findLast(
                (s) => s.surveyId === surveyId && s.phoneNumber === phoneNumber,
              ) ?? null,
            async createReceived(submission: SurveyAnswerSubmissionEntity) {
              saved.push(submission);
              return true;
            },
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  const submit = (expoId: string, cookie?: string, phoneNumber = PHONE) => {
    const call = request(app.getHttpServer())
      .post(`/surveys/answer/standard/${expoId}`)
      .send({
        phoneNumber,
        personalInformationStatus: true,
        answers: { '1': '좋았습니다' },
      });
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  it('세션 없이 제출하면 401이고, 등록·미등록 번호를 가리지 않는다', async () => {
    const registered = await submit(EXPO);
    const unregistered = await submit(EXPO, undefined, '01099999999');

    expect(registered.status).toBe(401);
    expect(registered.body).toMatchObject({ code: 'SESSION_REQUIRED' });
    expect(unregistered.status).toBe(401);
    expect(unregistered.body).toEqual(registered.body);
    expect(saved).toHaveLength(0);
  });

  it('다른 행사의 세션으로 제출하면 401', async () => {
    const response = await submit(EXPO, 'PARTICIPANT_SESSION=other-expo');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'SESSION_REQUIRED' });
    expect(saved).toHaveLength(0);
  });

  it('세션으로 제출하면 202이고, 응답자는 본문 번호가 아니라 세션의 번호다', async () => {
    const response = await submit(
      EXPO,
      'other=1; PARTICIPANT_SESSION=mine',
      '01099999999',
    );

    expect(response.status).toBe(202);
    expect(saved).toHaveLength(1);
    expect(saved[0].phoneNumber).toBe(PHONE);
  });

  it('같은 세션으로 다시 제출하면 409', async () => {
    await submit(EXPO, 'PARTICIPANT_SESSION=mine').expect(202);
    const again = await submit(EXPO, 'PARTICIPANT_SESSION=mine');

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'SURVEY_ANSWER_ALREADY_EXISTS' });
    expect(saved).toHaveLength(1);
  });

  describe('GET /surveys/answer/standard/:expoId/me (#203 본인 응답 상태)', () => {
    const me = (expoId: string, cookie?: string) => {
      const call = request(app.getHttpServer()).get(
        `/surveys/answer/standard/${expoId}/me`,
      );
      return cookie === undefined ? call : call.set('Cookie', cookie);
    };

    it('세션이 없거나 다른 행사의 것이면 401', async () => {
      const none = await me(EXPO);
      const other = await me(EXPO, 'PARTICIPANT_SESSION=other-expo');

      expect(none.status).toBe(401);
      expect(none.body).toMatchObject({ code: 'SESSION_REQUIRED' });
      expect(other.status).toBe(401);
    });

    it('설문이 없으면 404', async () => {
      const response = await me(OTHER_EXPO, 'PARTICIPANT_SESSION=other-expo');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'SURVEY_NOT_FOUND' });
    });

    it('제출 기록이 없으면 answered=false, status=null', async () => {
      const response = await me(EXPO, 'PARTICIPANT_SESSION=mine');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ answered: false, status: null });
    });

    it('접수·발행 중이면 RECEIVED, 저장 완료면 STORED로 답하고 둘 다 answered=true', async () => {
      await submit(EXPO, 'PARTICIPANT_SESSION=mine').expect(202);
      const received = await me(EXPO, 'PARTICIPANT_SESSION=mine');
      saved[0].status = SurveyAnswerSubmissionStatus.PUBLISHED;
      const published = await me(EXPO, 'PARTICIPANT_SESSION=mine');
      saved[0].status = SurveyAnswerSubmissionStatus.STORED;
      const stored = await me(EXPO, 'PARTICIPANT_SESSION=mine');

      expect(received.body).toEqual({ answered: true, status: 'RECEIVED' });
      expect(published.body).toEqual({ answered: true, status: 'RECEIVED' });
      expect(stored.body).toEqual({ answered: true, status: 'STORED' });
    });

    it('거절됐으면 다시 제출할 수 있으므로 answered=false, status=REJECTED', async () => {
      await submit(EXPO, 'PARTICIPANT_SESSION=mine').expect(202);
      saved[0].status = SurveyAnswerSubmissionStatus.REJECTED;

      const response = await me(EXPO, 'PARTICIPANT_SESSION=mine');

      expect(response.body).toEqual({ answered: false, status: 'REJECTED' });
    });

    it('거절 뒤 재제출했으면 최신 제출의 상태로 답한다', async () => {
      await submit(EXPO, 'PARTICIPANT_SESSION=mine').expect(202);
      saved[0].status = SurveyAnswerSubmissionStatus.REJECTED;
      await submit(EXPO, 'PARTICIPANT_SESSION=mine').expect(202);

      const response = await me(EXPO, 'PARTICIPANT_SESSION=mine');

      expect(response.body).toEqual({ answered: true, status: 'RECEIVED' });
    });
  });
});

describe('readSessionCookie', () => {
  it('같은 이름의 쿠키가 정확히 하나이고 비어 있지 않을 때만 값을 돌려준다', () => {
    const name = 'PARTICIPANT_SESSION';
    expect(readSessionCookie('a=1; PARTICIPANT_SESSION=s1', name)).toBe('s1');
    expect(readSessionCookie(undefined, name)).toBeUndefined();
    expect(readSessionCookie('PARTICIPANT_SESSION=', name)).toBeUndefined();
    expect(
      readSessionCookie('PARTICIPANT_SESSION=a; PARTICIPANT_SESSION=b', name),
    ).toBeUndefined();
    expect(readSessionCookie('XPARTICIPANT_SESSION=a', name)).toBeUndefined();
  });
});
