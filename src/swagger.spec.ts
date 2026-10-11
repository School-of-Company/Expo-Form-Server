import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { INTERNAL_TOKEN_HEADER } from './common/http/internal-token.constants.js';
import { InternalTokenGuard } from './common/http/internal-token.guard.js';
import { FormController } from './form/form.controller.js';
import { FormService } from './form/form.service.js';
import { InternalProgramFormController } from './form/internal-program-form.controller.js';
import { ProgramFormController } from './form/program-form.controller.js';
import { SWAGGER_JSON_PATH, SWAGGER_UI_PATH, setupSwagger } from './swagger.js';

const INTERNAL_PATH = '/internal/forms/by-id/{formId}';

type Env = Map<string, string>;

async function createApp(
  env: Env,
): Promise<{ app: INestApplication<Server>; opened: boolean }> {
  const module = await Test.createTestingModule({
    controllers: [
      FormController,
      ProgramFormController,
      InternalProgramFormController,
    ],
    providers: [{ provide: FormService, useValue: {} }],
  })
    .overrideGuard(InternalTokenGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = module.createNestApplication<INestApplication<Server>>();
  const config = {
    get: (key: string) => env.get(key),
  } as unknown as ConfigService;
  const opened = setupSwagger(app, config);
  await app.init();
  return { app, opened };
}

async function fetchDocument(app: INestApplication<Server>) {
  const response = await request(app.getHttpServer()).get(
    `/${SWAGGER_JSON_PATH}`,
  );
  return response.body as OpenAPIObject;
}

describe('setupSwagger', () => {
  let app: INestApplication<Server> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('SWAGGER_ENABLED가 없으면 문서를 열지 않아 JSON 경로가 404다', async () => {
    const created = await createApp(new Map());
    app = created.app;

    expect(created.opened).toBe(false);
    await request(app.getHttpServer())
      .get(`/${SWAGGER_JSON_PATH}`)
      .expect(404);
  });

  it.each(['false', '1', 'TRUE', ''])(
    'SWAGGER_ENABLED=%s는 꺼진 것으로 본다',
    async (value) => {
      const created = await createApp(new Map([['SWAGGER_ENABLED', value]]));
      app = created.app;

      expect(created.opened).toBe(false);
      await request(app.getHttpServer())
        .get(`/${SWAGGER_JSON_PATH}`)
        .expect(404);
    },
  );

  it('SWAGGER_ENABLED=true이면 /forms/v3/api-docs가 JSON을 돌려준다', async () => {
    const created = await createApp(new Map([['SWAGGER_ENABLED', 'true']]));
    app = created.app;

    await request(app.getHttpServer())
      .get(`/${SWAGGER_JSON_PATH}`)
      .expect(200)
      .expect('Content-Type', /json/u);

    expect(created.opened).toBe(true);
    const document = await fetchDocument(app);

    expect(Object.keys(document.paths)).toContain('/forms/by-id/{formId}');
  });

  it('문서 UI가 /forms/:expoId 경로에 먹히지 않고 HTML로 나온다', async () => {
    const created = await createApp(new Map([['SWAGGER_ENABLED', 'true']]));
    app = created.app;

    await request(app.getHttpServer())
      .get(`/${SWAGGER_UI_PATH}/`)
      .expect(200)
      .expect('Content-Type', /html/u);
  });

  it('기본으로 /internal/** 경로를 문서에서 뺀다', async () => {
    const created = await createApp(new Map([['SWAGGER_ENABLED', 'true']]));
    app = created.app;

    const document = await fetchDocument(app);

    expect(
      Object.keys(document.paths).filter((path) =>
        path.startsWith('/internal/'),
      ),
    ).toEqual([]);
    expect(document.components?.securitySchemes).toBeUndefined();
  });

  it('SWAGGER_INCLUDE_INTERNAL=true이면 포함하고 X-Internal-Token 헤더 스키마만 붙인다', async () => {
    const created = await createApp(
      new Map([
        ['SWAGGER_ENABLED', 'true'],
        ['SWAGGER_INCLUDE_INTERNAL', 'true'],
      ]),
    );
    app = created.app;

    const document = await fetchDocument(app);

    expect(document.paths[INTERNAL_PATH].get?.security).toEqual([
      { 'internal-token': [] },
    ]);
    expect(document.components?.securitySchemes?.['internal-token']).toEqual({
      type: 'apiKey',
      in: 'header',
      name: INTERNAL_TOKEN_HEADER,
    });
    expect(JSON.stringify(document)).not.toMatch(/secret|password/iu);
  });
});
