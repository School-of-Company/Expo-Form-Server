import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  EXPO_PROJECTION_ENABLED_KEY,
  isExpoProjectionEnabled,
} from '../expo-projection/expo-projection.config.js';
import { ExpoProjectionModule } from '../expo-projection/expo-projection.module.js';
import { ExpoProjectionStore } from '../expo-projection/expo-projection.store.js';
import { createExpoClient } from './expo-client.factory.js';
import { EXPO_CLIENT } from './expo-client.interface.js';
import { ProjectedExpoClient } from './projected-expo-client.js';

@Module({
  imports: [ConfigModule, ExpoProjectionModule],
  providers: [
    {
      provide: EXPO_CLIENT,
      inject: [ConfigService, ExpoProjectionStore],
      // 프로젝션이 꺼져 있으면 지금까지와 같은 동기 클라이언트를 그대로 쓴다.
      useFactory(config: ConfigService, store: ExpoProjectionStore) {
        const client = createExpoClient(config);
        return isExpoProjectionEnabled(
          config.get<string>(EXPO_PROJECTION_ENABLED_KEY),
        )
          ? new ProjectedExpoClient(client, store)
          : client;
      },
    },
  ],
  exports: [EXPO_CLIENT],
})
export class ExpoClientModule {}
