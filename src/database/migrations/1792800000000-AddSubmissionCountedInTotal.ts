import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 로그인/SMS 답변 접수가 설문 행의 `total_answers`를 늘리지 않고 접수 기록 수로 세어지도록 바뀌었다. 기존 행과 배포 중
 * 예전 버전이 넣는 행은 이미 `total_answers`에 더해져 있으므로 기본값 true로 표시하고, 지금 버전은 false로 넣어 따로 센다.
 * `total_answers`를 고치지 않으므로 배포 중 예전 버전과 겹쳐도 두 번 세어지지 않는다.
 */
export class AddSubmissionCountedInTotal1792800000000 implements MigrationInterface {
  name = 'AddSubmissionCountedInTotal1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_answer_submission" ADD "counted_in_total" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_survey_answer_submission_uncounted" ON "survey_answer_submission" ("survey_id") WHERE "status" <> 'REJECTED' AND "counted_in_total" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_survey_answer_submission_uncounted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_answer_submission" DROP COLUMN "counted_in_total"`,
    );
  }
}
