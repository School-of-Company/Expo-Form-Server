import path from 'node:path';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

/**
 * 컴파일된 엔티티·마이그레이션 위치. 앱(`DatabaseModule`)과 마이그레이션 CLI(`data-source.ts`)가
 * 같은 경로를 보도록 한 곳에서 정한다 — 둘이 어긋나면 CLI가 만든 마이그레이션이 앱이 아는 스키마와
 * 달라진다. 소스(`.ts`)가 아니라 `nest build` 결과(`.js`)를 가리키므로 먼저 빌드해야 한다.
 */
export const ENTITIES_GLOB = path.join(
  import.meta.dirname,
  '..',
  '**',
  '*.entity.js',
);
export const MIGRATIONS_GLOB = path.join(
  import.meta.dirname,
  'migrations',
  '*.js',
);

/**
 * 운영에서만 TLS로 접속한다. 인증서 체인을 신뢰할 수 없는 DB 제공자에 한해
 * `DATABASE_SSL_REJECT_UNAUTHORIZED=false`로 검증을 끌 수 있다(기본은 검증).
 */
export function resolveSsl(
  nodeEnv: string | undefined,
  rejectUnauthorizedFlag: string | undefined,
): false | { rejectUnauthorized: boolean } {
  return nodeEnv === 'production'
    ? { rejectUnauthorized: rejectUnauthorizedFlag !== 'false' }
    : false;
}

export const namingStrategy = new SnakeNamingStrategy();

/**
 * `pg` 풀에 넘기는 설정(TypeORM `extra`). 값이 없는 항목은 넣지 않아 `pg` 기본값을 그대로 쓴다.
 * 이름은 `pg`가 정한 외부 계약이라 camelCase 규칙을 적용하지 않는다.
 */
/* eslint-disable @typescript-eslint/naming-convention -- pg 풀 설정 이름과 환경변수 이름은 외부 계약이다 */
export type PoolSettings = {
  max?: number;
  connectionTimeoutMillis?: number;
  statement_timeout?: number;
  idle_in_transaction_session_timeout?: number;
};

const POOL_ENV_KEYS = {
  max: 'DB_POOL_MAX',
  connectionTimeoutMillis: 'DB_CONNECTION_TIMEOUT_MS',
  statement_timeout: 'DB_STATEMENT_TIMEOUT_MS',
  idle_in_transaction_session_timeout: 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- pg 외부 계약 이름 구간의 끝 */

/**
 * 연결 풀 크기와 타임아웃을 환경변수로 읽는다. 기본은 설정하지 않음(= `pg` 기본: 풀 10개, 연결 대기 무제한, 쿼리 제한 없음)이라
 * 값을 주기 전에는 지금 동작과 같다. 잘못된 값은 조용히 무시하지 않고 부팅에서 거부한다.
 *
 * - `DB_POOL_MAX`: 풀의 최대 연결 수(1 이상)
 * - `DB_CONNECTION_TIMEOUT_MS`: 풀에서 연결을 얻기까지 기다리는 최대 시간. 넘으면 요청이 매달리지 않고 실패한다
 * - `DB_STATEMENT_TIMEOUT_MS`: 쿼리 하나의 최대 실행 시간
 * - `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`: 트랜잭션을 열어 둔 채 쉬는 최대 시간(릴레이가 Kafka를 기다릴 때 락을 쥐는 시간의 상한)
 */
export function readPoolSettings(
  read: (key: string) => string | undefined,
): PoolSettings {
  const settings: PoolSettings = {};
  for (const [field, key] of Object.entries(POOL_ENV_KEYS) as Array<
    [keyof PoolSettings, string]
  >) {
    const raw = read(key);
    if (raw === undefined || raw.trim() === '') {
      continue;
    }

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid ${key}: must be a positive integer (${raw})`);
    }

    settings[field] = value;
  }

  return settings;
}
