/* eslint-disable @typescript-eslint/naming-convention -- `pg` 풀 설정 이름과 환경변수 이름은 외부 계약이다. */
import { describe, expect, it } from 'vitest';
import { readPoolSettings } from './database.config.js';

const reader = (entries: Array<[string, string]>) => {
  const env = new Map(entries);
  return (key: string) => env.get(key);
};

describe('readPoolSettings', () => {
  it('아무것도 주지 않으면 비어 있어 pg 기본값을 그대로 쓴다', () => {
    expect(readPoolSettings(reader([]))).toEqual({});
    expect(readPoolSettings(reader([['DB_POOL_MAX', '  ']]))).toEqual({});
  });

  it('환경변수를 pg 풀 설정 이름으로 바꿔 읽는다', () => {
    expect(
      readPoolSettings(
        reader([
          ['DB_POOL_MAX', '20'],
          ['DB_CONNECTION_TIMEOUT_MS', '5000'],
          ['DB_STATEMENT_TIMEOUT_MS', '30000'],
          ['DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', '120000'],
        ]),
      ),
    ).toEqual({
      max: 20,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 120_000,
    });
  });

  it.each(['0', '-1', '1.5', 'abc', '10s'])(
    '잘못된 값(%s)은 조용히 무시하지 않고 거부한다',
    (value) => {
      expect(() => readPoolSettings(reader([['DB_POOL_MAX', value]]))).toThrow(
        /DB_POOL_MAX/u,
      );
    },
  );
});
