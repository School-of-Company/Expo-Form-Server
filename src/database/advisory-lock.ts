import type { DataSource } from 'typeorm';

/**
 * 모든 인스턴스에서 도는 `@Cron` 작업을 한 인스턴스만 실행하게 한다. 세션 advisory lock을 못 잡으면 `run`을 부르지
 * 않고 `skipped`를 돌려준다. 키를 두 정수로 나눠 박람회별 잠금(`deleted-expo.store`의 단일 키)과 겹치지 않게 한다.
 * 잠금은 연결 하나에 걸리므로 같은 QueryRunner로 풀고, 프로세스가 죽어 연결이 끊기면
 * Postgres가 알아서 푼다.
 */
export async function runExclusive<T>(
  dataSource: DataSource,
  name: string,
  run: () => Promise<T>,
): Promise<{ skipped: true } | { skipped: false; result: T }> {
  const runner = dataSource.createQueryRunner();
  try {
    const [{ locked }] = (await runner.query(
      'SELECT pg_try_advisory_lock(1, hashtext($1)) AS locked',
      [name],
    )) as Array<{ locked: boolean }>;
    if (!locked) {
      return { skipped: true };
    }

    try {
      return { skipped: false, result: await run() };
    } finally {
      await runner.query('SELECT pg_advisory_unlock(1, hashtext($1))', [name]);
    }
  } finally {
    await runner.release();
  }
}
