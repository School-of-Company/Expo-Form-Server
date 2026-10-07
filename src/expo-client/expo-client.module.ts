import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createExpoClient } from './expo-client.factory.js';
import { EXPO_CLIENT } from './expo-client.interface.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EXPO_CLIENT,
      inject: [ConfigService],
      useFactory: createExpoClient,
    },
  ],
  exports: [EXPO_CLIENT],
})
export class ExpoClientModule {}
