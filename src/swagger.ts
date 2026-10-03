import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/** 문서 UI 경로. JSON 스펙은 `${SWAGGER_PATH}-json`으로 나간다. */
export const SWAGGER_PATH = 'docs';

/**
 * OpenAPI 문서를 연다. `createZodDto()`로 만든 DTO는 Zod 스키마에서 그대로 변환되므로 필드를
 * 따로 적지 않는다 — 다만 `cleanupOpenApiDoc`을 거쳐야 변환 결과가 올바른 OpenAPI 모양이 된다.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Expo Form Server')
    .setDescription('박람회 폼·설문 서비스 API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, cleanupOpenApiDoc(document));
}
