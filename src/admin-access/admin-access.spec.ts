import { Buffer } from 'node:buffer';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurveyAnswerService } from '../survey/survey-answer.service.js';
import { SurveyAnswerController } from '../survey/survey-answer.controller.js';
import { resetDownstreamGuards } from '../common/http/resilience.js';
import { FormController } from '../form/form.controller.js';
import { FormService } from '../form/form.service.js';
import { FormStore } from '../form/form.store.js';
import { ProgramAdminAccessGuard } from '../form/program-admin-access.guard.js';
import { ProgramFormController } from '../form/program-form.controller.js';
import { SurveyController } from '../survey/survey.controller.js';
import { SurveyService } from '../survey/survey.service.js';
import { SurveyGiftController } from '../survey/survey-gift.controller.js';
import { SurveyGiftService } from '../survey/survey-gift.service.js';
import { SurveyLotteryController } from '../survey/survey-lottery.controller.js';
import { SurveyLotteryService } from '../survey/survey-lottery.service.js';
import { SurveyPublicController } from '../survey/survey-public.controller.js';
import { SurveyPublicService } from '../survey/survey-public.service.js';
import { AdminAccessModule } from './admin-access.module.js';

const EXPO = 'abcdef01-abcd-4abc-8abc-abcdef012345';
const OTHER_EXPO = '22222222-2222-4222-8222-222222222222';
const FORM = '33333333-3333-4333-8333-333333333333';
const internalToken = 'x'.repeat(32);

type Role = 'OWNER' | 'MANAGER' | 'VIEWER' | 'STAFF';
const authorization = (role: Role) => {
  const claims = {
    sub: role === 'STAFF' ? 'staff:invite-test' : '123',
    role: role === 'STAFF' ? 'ROLE_STAFF' : 'ROLE_ADMIN',
    expoId: EXPO,
    memberRole: role,
  };
  return `Bearer stub.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.stub`;
};

const protectedRoutes = [
  ['post', `/forms/${EXPO}`],
  ['patch', `/forms/${EXPO}`],
  ['delete', `/forms/${EXPO}/STANDARD/PRE`],
  ['post', `/forms/expos/${EXPO}/program-forms`],
  ['get', `/forms/expos/${EXPO}/program-forms`],
  ['patch', `/forms/by-id/${FORM}`],
  ['delete', `/forms/by-id/${FORM}`],
  ['post', `/surveys/${EXPO}`],
  ['patch', `/surveys/${EXPO}`],
  ['delete', `/surveys/${EXPO}/STANDARD`],
  ['get', `/surveys/${EXPO}/lottery`],
  ['patch', `/surveys/${EXPO}/lottery`],
  ['get', `/surveys/${EXPO}/gift-pin`],
  ['put', `/surveys/${EXPO}/gift-pin`],
] as const;

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('관리자 박람회 접근 HTTP 계약', () => {
  let app: INestApplication<Server>;
  let downstreamStatus: number | undefined;
  let invalidResponse = false;
  let responseExpo: string;
  let programExpo: string | null;
  const write = vi.fn();
  async function fakeExpoServer(input: string, init?: RequestInit) {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    if (headers.get('X-Internal-Token') !== internalToken) {
      return jsonResponse(401);
    }

    if (downstreamStatus !== undefined) {
      return jsonResponse(downstreamStatus);
    }

    const stats = url.searchParams.get('permission') === 'STATS_READ';
    const privileged = (['OWNER', 'MANAGER'] as const).some(
      (role) => headers.get('Authorization') === authorization(role),
    );
    const statsAllowed = (['VIEWER', 'STAFF'] as const).some(
      (role) => headers.get('Authorization') === authorization(role),
    );
    if (
      url.pathname.toLowerCase() !== `/internal/expo/${EXPO}/admin-access` ||
      (!privileged && !(stats && statsAllowed))
    ) {
      return jsonResponse(403);
    }

    return jsonResponse(
      200,
      invalidResponse
        ? {}
        : {
            expoId: responseExpo,
            permission: stats ? 'STATS_READ' : 'APPLICATION_READ',
            policyVersion: 'GLOBAL_ADMIN_APPLICATION_READ_V1',
            scope: 'GLOBAL_ADMIN',
          },
    );
  }

  const fetchMock = vi.fn(fakeExpoServer);

  async function createApp(configured = true) {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () =>
              configured
                ? Object.fromEntries([
                    ['EXPO_SERVICE_URL', 'http://expo-server'],
                    ['EXPO_SERVICE_INTERNAL_TOKEN', internalToken],
                  ])
                : {},
          ],
        }),
        AdminAccessModule,
      ],
      controllers: [
        FormController,
        ProgramFormController,
        SurveyController,
        SurveyLotteryController,
        SurveyGiftController,
        SurveyPublicController,
        SurveyAnswerController,
      ],
      providers: [
        ProgramAdminAccessGuard,
        {
          provide: SurveyAnswerService,
          useValue: {
            findMyAnswerStatus: () => ({}),
            submit: () => ({}),
          },
        },
        {
          provide: FormStore,
          useValue: {
            findProgramById: vi.fn(async () =>
              programExpo === null ? null : { expoId: programExpo },
            ),
          },
        },
        {
          provide: FormService,
          useValue: {
            create: write,
            update: write,
            delete: write,
            createProgram: write,
            updateProgram: write,
            deleteProgram: write,
            findOne: () => ({}),
            findProgram: () => ({}),
            findProgramsByExpo: () => [],
          },
        },
        {
          provide: SurveyService,
          useValue: {
            create: write,
            update: write,
            delete: write,
            findOne: () => ({}),
            countAnswers: () => ({ count: 7 }),
          },
        },
        {
          provide: SurveyLotteryService,
          useValue: { find: () => ({}), update: write },
        },
        {
          provide: SurveyGiftService,
          useValue: {
            findPin: () => ({}),
            updatePin: write,
            findStatus: () => ({}),
            confirm: () => ({}),
          },
        },
        {
          provide: SurveyPublicService,
          useValue: { findSurvey: () => ({}), submit: () => ({}) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }

  beforeEach(async () => {
    downstreamStatus = undefined;
    invalidResponse = false;
    responseExpo = EXPO;
    programExpo = EXPO;
    write.mockClear();
    fetchMock.mockReset().mockImplementation(fakeExpoServer);
    resetDownstreamGuards();
    vi.stubGlobal('fetch', fetchMock);
    await createApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it.each(protectedRoutes)(
    'VIEWER의 %s %s를 403으로 거부한다',
    async (method, path) => {
      const call = request(app.getHttpServer())[method](path);
      await call
        .set('Authorization', authorization('VIEWER'))
        .send({})
        .expect(403);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('다른 박람회의 폼 수정은 403이고 변경하지 않는다', async () => {
    await request(app.getHttpServer())
      .patch(`/forms/${OTHER_EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(403);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['OWNER', 'MANAGER'] as const)(
    '%s는 폼을 수정할 수 있다',
    async (role) => {
      await request(app.getHttpServer())
        .patch(`/forms/${EXPO}`)
        .set('Authorization', authorization(role))
        .send({})
        .expect(204);
      expect(write).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [EXPO.toUpperCase(), EXPO],
    [EXPO, EXPO.toUpperCase()],
    [EXPO.toUpperCase(), EXPO.toUpperCase()],
  ])(
    '요청 UUID %s와 응답 UUID %s의 대소문자가 달라도 허용한다',
    async (requestedExpo, returnedExpo) => {
      responseExpo = returnedExpo;

      await request(app.getHttpServer())
        .patch(`/forms/${requestedExpo}`)
        .set('Authorization', authorization('MANAGER'))
        .send({})
        .expect(204);

      expect(write).toHaveBeenCalledOnce();
    },
  );

  it('응답 UUID가 다른 박람회이면 대소문자와 관계없이 503으로 거부한다', async () => {
    responseExpo = OTHER_EXPO;

    await request(app.getHttpServer())
      .patch(`/forms/${EXPO.toUpperCase()}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(503);

    expect(write).not.toHaveBeenCalled();
  });

  it.each(['VIEWER', 'STAFF'] as const)(
    '%s는 STATS_READ로 answer-count를 조회한다',
    async (role) => {
      await request(app.getHttpServer())
        .get(`/surveys/${EXPO}/answer-count?type=STANDARD`)
        .set('Authorization', authorization(role))
        .expect(200, { count: 7 });
    },
  );

  it('STAFF는 폼을 수정할 수 없다', async () => {
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('STAFF'))
      .send({})
      .expect(403);
    expect(write).not.toHaveBeenCalled();
  });

  it('프로그램 폼이 속한 박람회로 판정한다', async () => {
    programExpo = OTHER_EXPO;
    await request(app.getHttpServer())
      .patch(`/forms/by-id/${FORM}`)
      .set('Authorization', authorization('MANAGER'))
      .send({ expoId: EXPO })
      .expect(403);
    expect(write).not.toHaveBeenCalled();
  });

  it('프로그램 폼이 없으면 404다', async () => {
    programExpo = null;
    await request(app.getHttpServer())
      .delete(`/forms/by-id/${FORM}`)
      .set('Authorization', authorization('MANAGER'))
      .expect(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401],
    [403, 403],
    [404, 404],
    [500, 503],
    [503, 503],
  ] as const)('Expo %s 응답을 HTTP %s로 구분한다', async (status, expected) => {
    downstreamStatus = status;
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(expected);
    expect(write).not.toHaveBeenCalled();
  });

  it('잘못된 Expo 성공 응답도 503으로 거부한다', async () => {
    invalidResponse = true;
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(503);
    expect(write).not.toHaveBeenCalled();
  });

  it('연결 장애는 503으로 거부한다', async () => {
    fetchMock.mockRejectedValue(new TypeError('stub network failure'));
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(503);
    expect(write).not.toHaveBeenCalled();
  });

  it('Expo 설정이 없어도 부팅하며 관리자 요청은 503으로 거부한다', async () => {
    await app.close();
    await createApp(false);
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('인증 헤더 대신 x-user-role을 보낸 요청은 401이다', async () => {
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('x-user-role', 'ROLE_ADMIN')
      .send({})
      .expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([`/forms/not-a-uuid`, `/forms/by-id/not-a-uuid`])(
    '잘못된 경로 %s는 조회 전에 400이다',
    async (path) => {
      await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', authorization('MANAGER'))
        .send({})
        .expect(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('권한 변경은 다음 요청부터 다시 판정한다', async () => {
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(204);
    downstreamStatus = 403;
    await request(app.getHttpServer())
      .patch(`/forms/${EXPO}`)
      .set('Authorization', authorization('MANAGER'))
      .send({})
      .expect(403);
    expect(write).toHaveBeenCalledOnce();
  });

  it.each([
    `/forms/${EXPO}?type=STANDARD&applicationType=PRE`,
    `/forms/by-id/${FORM}`,
    `/surveys/${EXPO}?type=STANDARD`,
    `/surveys/public/${EXPO}`,
    `/surveys/answer/standard/${EXPO}/me`,
    `/surveys/answer/trainee/${EXPO}/me`,
  ])('공개 GET %s는 관리자 인증을 요구하지 않는다', async (path) => {
    await request(app.getHttpServer()).get(path).expect(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    `/surveys/answer/public/${EXPO}`,
    `/surveys/answer/standard/${EXPO}`,
    `/surveys/answer/trainee/${EXPO}`,
  ])('참가자 답변 제출 %s는 관리자 인증을 요구하지 않는다', async (path) => {
    const response = await request(app.getHttpServer()).post(path).send({});
    expect([200, 202]).toContain(response.status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['status', 'confirm'])(
    'gift-pickup/%s는 관리자 인증을 요구하지 않는다',
    async (action) => {
      await request(app.getHttpServer())
        .post(`/surveys/${EXPO}/gift-pickup/${action}`)
        .send({})
        .expect(200);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
