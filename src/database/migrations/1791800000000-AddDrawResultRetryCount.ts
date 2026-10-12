import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 당첨 결과 발행 실패 횟수 컬럼. 릴레이가 계속 실패하는 건을 무한히 재시도하지 않고 상한에서 멈추기 위해 쓴다.
 * 이미 있는 행은 0에서 시작한다.
 */
export class AddDrawResultRetryCount1791800000000 implements MigrationInterface {
  name = 'AddDrawResultRetryCount1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_draw_result" ADD "retry_count" integer NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_draw_result" DROP COLUMN "retry_count"`,
    );
  }
}
