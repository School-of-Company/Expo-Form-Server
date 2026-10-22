import { QueryFailedError } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { mapUniqueViolation } from './postgres-error.util.js';

class Conflict extends Error {}

function queryFailed(code: string) {
  return new QueryFailedError(
    'insert',
    [],
    Object.assign(new Error(), { code }),
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
