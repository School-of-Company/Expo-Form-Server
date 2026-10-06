import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createUserClient } from './user-client.factory.js';
import { USER_CLIENT } from './user-client.interface.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: USER_CLIENT,
      inject: [ConfigService],
      useFactory: createUserClient,
    },
  ],
  exports: [USER_CLIENT],
})
export class UserClientModule {}
