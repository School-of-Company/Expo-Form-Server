import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EurekaModule } from '@school-of-company/nestjs-eureka';
import { DicoshotModule } from 'dicoshot-nest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DomainExceptionFilter } from './common/exceptions/domain-exception.filter.js';
import { dicoshotFilterOptions } from './common/notification/dicoshot-filter.options.js';
import { DatabaseModule } from './database/database.module.js';
import {
  buildEurekaOptions,
  EUREKA_SERVICE_URL_ENV,
} from './eureka/eureka-options.js';
import { ExpoModule } from './expo/expo.module.js';
import { ExpoChangedConsumerModule } from './expo-projection/expo-changed-consumer.module.js';
import {
  EXPO_PROJECTION_ENABLED_KEY,
  isExpoProjectionEnabled,
} from './expo-projection/expo-projection.config.js';
import { HealthController } from './health/health.controller.js';
import { FormModule } from './form/form.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { getMetricsRuntime } from './metrics/metrics-runtime.js';
import { KafkaModule } from './kafka/kafka.module.js';
import { SurveyModule } from './survey/survey.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
      filter: dicoshotFilterOptions,
    }),
    ScheduleModule.forRoot(),
    ConditionalModule.registerWhen(
      EurekaModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          buildEurekaOptions(
            {
              serviceUrl: config.getOrThrow<string>(EUREKA_SERVICE_URL_ENV),
              hostName: config.get<string>('INSTANCE_HOSTNAME'),
              ipAddr: config.get<string>('INSTANCE_IP_ADDR'),
              port: config.get<string>('PORT'),
            },
            getMetricsRuntime()?.bind,
          ),
      }),
      (env) => (env[EUREKA_SERVICE_URL_ENV] ?? '') !== '',
    ),
    KafkaModule,
    DatabaseModule,
    MetricsModule,
    FormModule,
    SurveyModule,
    ExpoModule,
    ConditionalModule.registerWhen(ExpoChangedConsumerModule, (env) =>
      isExpoProjectionEnabled(env[EXPO_PROJECTION_ENABLED_KEY]),
    ),
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
