import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOccupationAndSchoolFormTypes1791285662843 implements MigrationInterface {
  name = 'AddOccupationAndSchoolFormTypes1791285662843';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_dynamic_form_type_enum" ADD VALUE 'OCCUPATION'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_dynamic_form_type_enum" ADD VALUE 'SCHOOL'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 되돌리기 전에 OCCUPATION·SCHOOL을 쓰는 필드를 먼저 지우거나 바꿔야 한다 — 남아 있으면 아래 형 변환이 실패한다.
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_form_dynamic_form_type_enum_old" AS ENUM('NAME', 'PHONE_NUMBER', 'TRAINING_ID', 'DEFAULT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_form" ALTER COLUMN "dynamic_form_type" TYPE "public"."dynamic_form_dynamic_form_type_enum_old" USING "dynamic_form_type"::"text"::"public"."dynamic_form_dynamic_form_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dynamic_form_dynamic_form_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_dynamic_form_type_enum_old" RENAME TO "dynamic_form_dynamic_form_type_enum"`,
    );
  }
}
