import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { SWAGGER_PATH, setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalPipes(new ZodValidationPipe());

  const config = app.get(ConfigService);

  // API 표면이 그대로 드러나는 문서는 운영에서는 열지 않는다.
  const swaggerEnabled = config.get<string>('NODE_ENV') !== 'production';
  if (swaggerEnabled) setupSwagger(app);

  const port = config.get<string>('PORT') ?? 3000;
  await app.listen(port);
  if (swaggerEnabled) {
    new Logger('Bootstrap').log(
      `API 문서: http://localhost:${port}/${SWAGGER_PATH}`,
    );
  }
}
await bootstrap();
