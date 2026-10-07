import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionFieldType1791400000000 implements MigrationInterface {
  name = 'AddRegionFieldType1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_survey_form_type_enum" ADD VALUE 'REGION'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_form_type_enum" ADD VALUE 'REGION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 되돌리기 전에 REGION을 쓰는 필드·문항을 먼저 지우거나 바꿔야 한다 — 남아 있으면 아래 형 변환이 실패한다.
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_form_form_type_enum_old" AS ENUM('SENTENCE', 'CHECKBOX', 'DROPDOWN', 'IMAGE', 'MULTIPLE', 'COMPANION')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_form" ALTER COLUMN "form_type" TYPE "public"."dynamic_form_form_type_enum_old" USING "form_type"::"text"::"public"."dynamic_form_form_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."dynamic_form_form_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_form_type_enum_old" RENAME TO "dynamic_form_form_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_survey_form_type_enum_old" AS ENUM('SENTENCE', 'CHECKBOX', 'DROPDOWN', 'IMAGE', 'MULTIPLE', 'COMPANION')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_survey" ALTER COLUMN "form_type" TYPE "public"."dynamic_survey_form_type_enum_old" USING "form_type"::"text"::"public"."dynamic_survey_form_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dynamic_survey_form_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_survey_form_type_enum_old" RENAME TO "dynamic_survey_form_type_enum"`,
    );
  }
}
