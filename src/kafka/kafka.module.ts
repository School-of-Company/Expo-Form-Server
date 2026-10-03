import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import { KAFKA_CLIENT } from './kafka.constants.js';

/**
 * Kafka 클라이언트를 앱 전체에 하나만 두고 공유한다. 프로듀서/컨슈머는 이 클라이언트에서
 * `kafka.producer()`/`kafka.consumer()`로 각자 필요한 만큼 만들어 쓴다 — 클라이언트 자체는
 * 연결을 들고 있지 않고 설정만 캡슐화하므로 공유해도 무방하다.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KAFKA_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Kafka({
          clientId: config.get<string>('KAFKA_CLIENT_ID', 'expo-form-server'),
          brokers: config.getOrThrow<string>('KAFKA_BROKERS').split(','),
        }),
    },
  ],
  exports: [KAFKA_CLIENT],
})
export class KafkaModule {}
