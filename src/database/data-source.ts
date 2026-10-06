import process from 'node:process';
import { DataSource } from 'typeorm';
import {
  ENTITIES_GLOB,
  MIGRATIONS_GLOB,
  namingStrategy,
  resolveSsl,
} from './database.config.js';

/**
 * 마이그레이션 CLI 전용 데이터 소스. 앱은 `DatabaseModule`을 쓰고, 이 파일은 `pnpm migration:*`
 * 스크립트만 읽는다. 앱처럼 `ConfigModule`이 `.env`를 읽어 주지 않으므로 스크립트가
 * `--env-file`로 환경 변수를 넣어 준다.
 */
const url = process.env.DATABASE_URL;
if (url === undefined || url === '') {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const dataSource = new DataSource({
  type: 'postgres',
  url,
  entities: [ENTITIES_GLOB],
  migrations: [MIGRATIONS_GLOB],
  namingStrategy,
  ssl: resolveSsl(
    process.env.NODE_ENV,
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  ),
});

export default dataSource;
