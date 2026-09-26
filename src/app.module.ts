import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { DicoshotModule } from 'dicoshot-nest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DomainExceptionFilter } from './common/exceptions/domain-exception.filter.js';
import { DatabaseModule } from './database/database.module.js';
import { FormModule } from './form/form.module.js';
import { SurveyModule } from './survey/survey.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 앱 시작/종료·처리되지 않은 예외를 Discord 채널로 알림. webhookUrl 미설정 시 자동 비활성화.
    DicoshotModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (...args: unknown[]) => {
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
