import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKindergartenOccupation1791500000000 implements MigrationInterface {
  name = 'AddKindergartenOccupation1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."survey_qr_answer_occupation_enum" ADD VALUE 'KINDERGARTEN_STUDENT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 되돌리기 전에 KINDERGARTEN_STUDENT 응답이 남아 있으면 아래 형 변환이 실패한다. 먼저 지우거나 다른 값으로 바꿔야 한다.
    await queryRunner.query(
      `CREATE TYPE "public"."survey_qr_answer_occupation_enum_old" AS ENUM('ELEMENTARY_STUDENT', 'MIDDLE_SCHOOL_STUDENT', 'HIGH_SCHOOL_STUDENT', 'SCHOOL_STAFF', 'PRE_SERVICE_TEACHER', 'PARENT', 'GENERAL', 'TEACHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ALTER COLUMN "occupation" TYPE "public"."survey_qr_answer_occupation_enum_old" USING "occupation"::"text"::"public"."survey_qr_answer_occupation_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."survey_qr_answer_occupation_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."survey_qr_answer_occupation_enum_old" RENAME TO "survey_qr_answer_occupation_enum"`,
    );
  }
}
