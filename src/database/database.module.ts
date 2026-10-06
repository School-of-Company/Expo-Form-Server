import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MIGRATIONS_GLOB,
  namingStrategy,
  resolveSsl,
} from './database.config.js';

/**
 * 개발에서는 엔티티를 보고 스키마를 자동으로 맞추지만(`synchronize`), 운영에서는 끈다 —
 * 컬럼 이름 변경이 "삭제 후 추가"로 처리되어 데이터가 사라질 수 있어서다. 운영 스키마는
 * `src/database/migrations`의 마이그레이션으로만 바꾸고, 자동 실행(`migrationsRun`)은
 * 하지 않는다: 인스턴스가 여러 개 뜰 때 서로 부딪히지 않도록 배포 단계에서 `pnpm migration:run`
 * 한 번으로 적용한다.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        namingStrategy,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        migrations: [MIGRATIONS_GLOB],
        ssl: resolveSsl(
          config.get<string>('NODE_ENV'),
          config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED'),
        ),
      }),
    }),
  ],
})
export class DatabaseModule {}
