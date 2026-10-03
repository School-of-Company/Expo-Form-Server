import { SnakeNamingStrategy } from './snake-naming.strategy.js';

/**
 * 컴파일된 엔티티·마이그레이션 위치. 앱(`DatabaseModule`)과 마이그레이션 CLI(`data-source.ts`)가
 * 같은 경로를 보도록 한 곳에서 정한다 — 둘이 어긋나면 CLI가 만든 마이그레이션이 앱이 아는 스키마와
 * 달라진다. 소스(`.ts`)가 아니라 `nest build` 결과(`.js`)를 가리키므로 먼저 빌드해야 한다.
 */
export const ENTITIES_GLOB = `${import.meta.dirname}/../**/*.entity.js`;
export const MIGRATIONS_GLOB = `${import.meta.dirname}/migrations/*.js`;

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
