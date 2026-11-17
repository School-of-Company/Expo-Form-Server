import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { readInternalServiceOptions } from '../common/http/internal-service.config.js';
import { EXPO_SERVICE_CONFIG_KEYS } from '../expo-client/expo-client.factory.js';
import { ADMIN_ACCESS_CLIENT } from './admin-access-client.interface.js';
import { ExpoAdminAccessGuard } from './expo-admin-access.guard.js';
import { HttpAdminAccessClient } from './http-admin-access-client.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ADMIN_ACCESS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new HttpAdminAccessClient(
          readInternalServiceOptions(config, EXPO_SERVICE_CONFIG_KEYS),
        ),
    },
    ExpoAdminAccessGuard,
  ],
  exports: [ADMIN_ACCESS_CLIENT, ExpoAdminAccessGuard],
})
export class AdminAccessModule {}
