import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createParticipationClient } from './participation-client.factory.js';
import { PARTICIPATION_CLIENT } from './participation-client.interface.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PARTICIPATION_CLIENT,
      inject: [ConfigService],
      useFactory: createParticipationClient,
    },
  ],
  exports: [PARTICIPATION_CLIENT],
})
export class ParticipationClientModule {}
