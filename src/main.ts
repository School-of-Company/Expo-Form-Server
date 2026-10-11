import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { SWAGGER_UI_PATH, setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
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
