import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 직업(유형)을 사전등록 공식 요구사항의 6개(유, 초, 중고, 일반, 교사, 예비교사)로 바꾼다. Postgres enum은 값을
 * 지울 수 없어서 새 타입을 만들고 컬럼을 옮긴다. 기존 값은 아래처럼 대응한다.
 *
 * - 중학생, 고등학생 → 중고
 * - 교직원, 보호자/학부모 → 일반
 *
 * `down`은 반대로 되돌리지만 값이 합쳐져 있어 원래대로 복원되지는 않는다(중고는 중학생으로, 일반은 일반인으로,
 * 유치원생은 초등학생으로 돌아간다).
 */
export class ChangeOccupationToOfficialTypes1791500000000 implements MigrationInterface {
  name = 'ChangeOccupationToOfficialTypes1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."survey_qr_answer_occupation_enum" RENAME TO "survey_qr_answer_occupation_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."survey_qr_answer_occupation_enum" AS ENUM('KINDERGARTEN_STUDENT', 'ELEMENTARY_STUDENT', 'MIDDLE_HIGH_SCHOOL_STUDENT', 'GENERAL', 'TEACHER', 'PRE_SERVICE_TEACHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ALTER COLUMN "occupation" TYPE "public"."survey_qr_answer_occupation_enum" USING (CASE "occupation"::text WHEN 'MIDDLE_SCHOOL_STUDENT' THEN 'MIDDLE_HIGH_SCHOOL_STUDENT' WHEN 'HIGH_SCHOOL_STUDENT' THEN 'MIDDLE_HIGH_SCHOOL_STUDENT' WHEN 'SCHOOL_STAFF' THEN 'GENERAL' WHEN 'PARENT' THEN 'GENERAL' ELSE "occupation"::text END)::"public"."survey_qr_answer_occupation_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."survey_qr_answer_occupation_enum_old"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."survey_qr_answer_occupation_enum" RENAME TO "survey_qr_answer_occupation_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."survey_qr_answer_occupation_enum" AS ENUM('ELEMENTARY_STUDENT', 'MIDDLE_SCHOOL_STUDENT', 'HIGH_SCHOOL_STUDENT', 'SCHOOL_STAFF', 'PRE_SERVICE_TEACHER', 'PARENT', 'GENERAL', 'TEACHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ALTER COLUMN "occupation" TYPE "public"."survey_qr_answer_occupation_enum" USING (CASE "occupation"::text WHEN 'KINDERGARTEN_STUDENT' THEN 'ELEMENTARY_STUDENT' WHEN 'MIDDLE_HIGH_SCHOOL_STUDENT' THEN 'MIDDLE_SCHOOL_STUDENT' ELSE "occupation"::text END)::"public"."survey_qr_answer_occupation_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."survey_qr_answer_occupation_enum_new"`,
    );
  }
}
