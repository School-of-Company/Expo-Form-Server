import { QueryFailedError } from 'typeorm';
import { describe, expect, it } from 'vitest';
import {
  isTransientDbError,
  mapUniqueViolation,
} from './postgres-error.util.js';

class Conflict extends Error {}

function queryFailed(code: string) {
  return new QueryFailedError(
    'insert',
    [],
    Object.assign(new Error('driver'), { code }),
  );
}

describe('mapUniqueViolation', () => {
  it('성공하면 결과를 그대로 돌려준다', async () => {
    await expect(
      mapUniqueViolation(
        async () => 7,
        () => new Conflict(),
      ),
    ).resolves.toBe(7);
  });

  it('유니크 위반은 호출부가 정한 예외로 바꾼다', async () => {
    await expect(
      mapUniqueViolation(
        async () => {
          throw queryFailed('23505');
        },
        () => new Conflict(),
      ),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('다른 오류는 그대로 다시 던진다', async () => {
    const error = queryFailed('23503');

    await expect(
      mapUniqueViolation(
        async () => {
          throw error;
        },
        () => new Conflict(),
      ),
    ).rejects.toBe(error);
  });
});

describe('isTransientDbError', () => {
  it.each([
    ['연결 예외', queryFailed('08006')],
    ['교착', queryFailed('40P01')],
    ['관리자 종료', queryFailed('57P01')],
    ['감싼 소켓 오류', queryFailed('ECONNRESET')],
    ['풀 대기 초과', new Error('timeout exceeded when trying to connect')],
  ])('%s는 다시 시도할 오류다', (_name, error) => {
    expect(isTransientDbError(error)).toBe(true);
  });

  it.each([
    ['데이터 오류', queryFailed('22003')],
    ['유니크 위반', queryFailed('23505')],
    ['코드 버그', new TypeError('x is undefined')],
    ['Error가 아닌 값', 'boom'],
  ])('%s는 다시 시도할 오류가 아니다', (_name, error) => {
    expect(isTransientDbError(error)).toBe(false);
  });
});
