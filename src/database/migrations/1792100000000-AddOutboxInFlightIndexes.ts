import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 아웃박스 릴레이와 지표가 쓰는 부분 인덱스 두 개. 접수 테이블에는 `status`/`created_at` 인덱스가 없어서 릴레이 조회가
 * 매번 전체를 훑었고, 종결된 행이 쌓일수록 느려진다. 부분 인덱스라 종결 행은 인덱스에 들어가지 않는다.
 *
 * `CREATE INDEX`는 만드는 동안 해당 테이블의 쓰기를 막는다(마이그레이션이 트랜잭션 안이라 `CONCURRENTLY`를 못 쓴다).
 * 테이블이 매우 크면 배포 전에 한가한 시간에 적용한다.
 */
export class AddOutboxInFlightIndexes1792100000000 implements MigrationInterface {
  name = 'AddOutboxInFlightIndexes1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_survey_answer_submission_in_flight" ON "survey_answer_submission" ("status", "created_at") WHERE "status" IN ('RECEIVED', 'PUBLISHED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_survey_draw_result_unpublished" ON "survey_draw_result" ("created_at") WHERE "published_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_survey_draw_result_unpublished"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IX_survey_answer_submission_in_flight"`,
    );
  }
}
