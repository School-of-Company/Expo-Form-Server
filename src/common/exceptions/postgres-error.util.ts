import { QueryFailedError } from 'typeorm';

/** PostgreSQL의 유니크 제약 위반 에러 코드(SQLSTATE). */
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

/** PostgreSQL의 외래 키 제약 위반 에러 코드(SQLSTATE). */
const POSTGRES_FOREIGN_KEY_VIOLATION_CODE = '23503';

/**
 * store가 던진 에러가 PostgreSQL 유니크 제약 위반인지 확인한다.
 *
 * 애플리케이션 레벨 중복 검사(`exists*`)는 동시 요청 사이의 경합을 막지 못한다 — 두 요청이
 * 동시에 검사를 통과하면 DB의 유니크 제약이 최종 방어선이 되고, 그 위반을 여기서 잡아 409로
 * 변환하지 않으면 500이 그대로 나간다. `form`·`survey` 양쪽이 같은 조회-후-저장 구조라 이
 * 확인이 공통으로 필요하다.
 *
 * TypeORM은 드라이버 에러를 `QueryFailedError`로 감싸고, pg 드라이버는 그 안의
 * `driverError.code`에 SQLSTATE를 담아 보낸다. 이 코드가 아니면 우리가 다룰 수 없는 에러이므로
 * 호출부가 그대로 다시 던져야 한다.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string })?.code ===
      POSTGRES_UNIQUE_VIOLATION_CODE
  );
}

/**
 * store가 던진 에러가 PostgreSQL 외래 키 제약 위반인지 확인한다. 부모 row(설문)를 확인한 뒤 자식 row(응답)를
 * 저장하는 사이에 부모가 삭제되면 이 위반이 나므로, 호출부는 500 대신 "부모가 없다"로 바꿔 응답한다.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string })?.code ===
      POSTGRES_FOREIGN_KEY_VIOLATION_CODE
  );
}
