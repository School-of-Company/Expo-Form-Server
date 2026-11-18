import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 정합성 점검이 다음에 이어 볼 위치를 인스턴스 메모리 대신 DB 한 행에 둔다. 점검을 맡는 인스턴스가 바뀌어도
 * 상한(1000건) 뒤의 기록까지 이어서 본다. 행은 하나뿐이다(`id = 1`).
 */
export class AddSurveyAnswerReconcileCursor1792600000000 implements MigrationInterface {
  name = 'AddSurveyAnswerReconcileCursor1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "survey_answer_reconcile_cursor" ("id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1), "resume_after_id" uuid)`,
    );
    await queryRunner.query(
      `INSERT INTO "survey_answer_reconcile_cursor" ("id") VALUES (1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "survey_answer_reconcile_cursor"`);
  }
}
