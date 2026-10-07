import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubmissionEventVersion1791339098462 implements MigrationInterface {
  name = 'AddSubmissionEventVersion1791339098462';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_answer_submission" ADD "event_version" smallint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_answer_submission" DROP COLUMN "event_version"`,
    );
  }
}
