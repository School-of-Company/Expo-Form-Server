import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EurekaModule } from '@school-of-company/nestjs-eureka';
import { DicoshotModule } from 'dicoshot-nest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DomainExceptionFilter } from './common/exceptions/domain-exception.filter.js';
import { DatabaseModule } from './database/database.module.js';
import {
  buildEurekaOptions,
  EUREKA_SERVICE_URL_ENV,
} from './eureka/eureka-options.js';
import { FormModule } from './form/form.module.js';
import { KafkaModule } from './kafka/kafka.module.js';
import { SurveyModule } from './survey/survey.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 앱 시작/종료·처리되지 않은 예외를 Discord 채널로 알림. webhookUrl 미설정 시 자동 비활성화.
    DicoshotModule.registerAsync({
      imports: [ConfigModule],
      useFactory(...args: unknown[]) {
        const config = args[0] as ConfigService;
        return {
          webhookUrl: config.get<string>('DISCORD_WEBHOOK_URL'),
          applicationName: 'expo-form-server',
        };
      },
      inject: [ConfigService],
      global: true,
      filter: true,
    }),
    ScheduleModule.forRoot(),
    // Gateway가 `/forms`, `/surveys`를 Eureka에서 찾을 수 있게 `expo-form-server`로 등록한다.
    // EUREKA_SERVICE_URL이 없으면(로컬·테스트·CI) 모듈을 불러오지 않는다. `.env`까지 읽힌 뒤에 판단하도록
    // ConditionalModule을 쓴다.
    ConditionalModule.registerWhen(
      EurekaModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          buildEurekaOptions({
            serviceUrl: config.getOrThrow<string>(EUREKA_SERVICE_URL_ENV),
            hostName: config.get<string>('INSTANCE_HOSTNAME'),
            ipAddr: config.get<string>('INSTANCE_IP_ADDR'),
            port: config.get<string>('PORT'),
          }),
      }),
      EUREKA_SERVICE_URL_ENV,
    ),
    KafkaModule,
    DatabaseModule,
    FormModule,
    SurveyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
