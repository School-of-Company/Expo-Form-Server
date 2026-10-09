import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSurveyPublicAnswer1791600000000 implements MigrationInterface {
  name = 'AddSurveyPublicAnswer1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."survey_public_answer_occupation_enum" AS ENUM('KINDERGARTEN_STUDENT', 'ELEMENTARY_STUDENT', 'MIDDLE_SCHOOL_STUDENT', 'HIGH_SCHOOL_STUDENT', 'SCHOOL_STAFF', 'PARENT', 'GENERAL', 'TEACHER', 'PRE_SERVICE_TEACHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_public_answer" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "survey_id" uuid NOT NULL, "answers" jsonb NOT NULL, "occupation" "public"."survey_public_answer_occupation_enum" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e13a97f88551c13d28f889f2e31" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_public_answer" ADD CONSTRAINT "FK_9dafdfb7d2de63e17c84c313a99" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_public_answer" DROP CONSTRAINT "FK_9dafdfb7d2de63e17c84c313a99"`,
    );
    await queryRunner.query(`DROP TABLE "survey_public_answer"`);
    await queryRunner.query(
      `DROP TYPE "public"."survey_public_answer_occupation_enum"`,
    );
  }
}
