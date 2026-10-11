import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { INTERNAL_TOKEN_HEADER } from './common/http/internal-token.constants.js';

/**
 * 게이트웨이 통합 API 문서(Expo-Gateway#30)는 경로 접두사로만 서비스를 찾는다. 이 서비스의 접두사는
 * `/forms`이므로 문서도 그 아래에 둔다. JSON 경로는 게이트웨이가 약속한 `/forms/v3/api-docs`다.
 */
export const SWAGGER_UI_PATH = 'forms/docs';
export const SWAGGER_JSON_PATH = 'forms/v3/api-docs';

const INTERNAL_PATH_PREFIX = '/internal/';
const INTERNAL_TOKEN_SCHEME = 'internal-token';

/** 환경 변수가 정확히 `true`일 때만 켠다. 없거나 다른 값이면 꺼진 것으로 본다. */
function isTrue(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * 문서 노출 범위를 정해 OpenAPI 문서를 만든다. `/internal/**`는 서비스 간 호출 전용이라 기본으로 뺀다.
 * 포함할 때는 호출에 `X-Internal-Token`이 필요하다는 것을 문서에 남긴다(토큰 값은 적지 않는다).
 */
export function buildOpenApiDocument(
  app: INestApplication,
  includeInternal: boolean,
): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Expo Form Server')
    .setDescription('박람회 폼·설문 서비스 API')
    .setVersion('1.0');
  if (includeInternal) {
    builder.addApiKey(
      { type: 'apiKey', in: 'header', name: INTERNAL_TOKEN_HEADER },
      INTERNAL_TOKEN_SCHEME,
    );
  }

  const document = SwaggerModule.createDocument(app, builder.build());

  // 경로를 지우는 대신 남길 경로로 다시 만든다.
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(
      ([path]) => includeInternal || !path.startsWith(INTERNAL_PATH_PREFIX),
    ),
  );

  if (includeInternal) {
    for (const [path, operations] of Object.entries(document.paths)) {
      if (!path.startsWith(INTERNAL_PATH_PREFIX)) {
        continue;
      }

      for (const operation of Object.values(operations)) {
        if (typeof operation === 'object' && operation !== null) {
          (operation as { security?: unknown }).security = [
            { [INTERNAL_TOKEN_SCHEME]: [] },
          ];
        }
      }
    }
  }

  // `createZodDto()`로 만든 DTO는 `cleanupOpenApiDoc`을 거쳐야 올바른 OpenAPI 모양이 된다.
  return cleanupOpenApiDoc(document);
}

/**
 * `SWAGGER_ENABLED=true`일 때만 문서를 연다(기본 꺼짐). 꺼져 있으면 문서 경로는 아예 등록되지 않아 404다.
 * `SWAGGER_INCLUDE_INTERNAL=true`이면 `/internal/**`도 문서에 넣는다(기본 제외).
 *
 * @returns 문서를 열었으면 true
 */
export function setupSwagger(
  app: INestApplication,
  config: Pick<ConfigService, 'get'>,
): boolean {
  if (!isTrue(config.get<string>('SWAGGER_ENABLED'))) {
    return false;
  }

  const document = buildOpenApiDocument(
    app,
    isTrue(config.get<string>('SWAGGER_INCLUDE_INTERNAL')),
  );
  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
  });

  return true;
}
