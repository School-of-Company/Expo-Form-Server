import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExpoChangedConsumer } from './expo-changed.consumer.js';
import { ExpoProjectionModule } from './expo-projection.module.js';

/**
 * `expo.expo.changed` 컨슈머 모듈. `KAFKA_EXPO_PROJECTION_ENABLED=true`일 때만 `AppModule`이 불러온다 —
 * 꺼져 있으면 토픽을 구독하지 않는다.
 */
@Module({
  imports: [ConfigModule, ExpoProjectionModule],
  providers: [ExpoChangedConsumer],
})
export class ExpoChangedConsumerModule {}
