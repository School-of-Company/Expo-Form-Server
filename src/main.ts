import process from 'node:process';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { createHttpMetricsMiddleware } from './metrics/http-metrics.middleware.js';
import { startMetrics } from './metrics/start-metrics.js';
import { SWAGGER_UI_PATH, setupSwagger } from './swagger.js';

async function bootstrap() {
  // Eureka 등록 옵션이 실제로 열린 포트만 metadata에 싣도록, Nest 컨테이너를 만들기 전에 listener부터 연다.
  const metricsRuntime = await startMetrics((key) => process.env[key]);
  const metrics = metricsRuntime?.service;

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  if (metrics !== undefined) {
    app.use(createHttpMetricsMiddleware(metrics));
  }

  app.useGlobalPipes(new ZodValidationPipe());

  const config = app.get(ConfigService);

  // API 표면이 그대로 드러나는 문서라 기본은 꺼짐이다. 서버에서 SWAGGER_ENABLED=true로 켠다.
  const swaggerEnabled = setupSwagger(app, config);

  const port = config.get<string>('PORT') ?? 3000;
  await app.listen(port);
  if (swaggerEnabled) {
    new Logger('Bootstrap').log(
      `API 문서: http://localhost:${port}/${SWAGGER_UI_PATH}`,
    );
  }
}

await bootstrap();
