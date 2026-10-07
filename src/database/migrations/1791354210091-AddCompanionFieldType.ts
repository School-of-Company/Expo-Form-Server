import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanionFieldType1791354210091 implements MigrationInterface {
  name = 'AddCompanionFieldType1791354210091';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_survey_form_type_enum" ADD VALUE 'COMPANION'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_form_type_enum" ADD VALUE 'COMPANION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 되돌리기 전에 COMPANION을 쓰는 필드·문항을 먼저 지우거나 바꿔야 한다 — 남아 있으면 아래 형 변환이 실패한다.
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_form_form_type_enum_old" AS ENUM('SENTENCE', 'CHECKBOX', 'DROPDOWN', 'IMAGE', 'MULTIPLE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_form" ALTER COLUMN "form_type" TYPE "public"."dynamic_form_form_type_enum_old" USING "form_type"::"text"::"public"."dynamic_form_form_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."dynamic_form_form_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."dynamic_form_form_type_enum_old" RENAME TO "dynamic_form_form_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_survey_form_type_enum_old" AS ENUM('SENTENCE', 'CHECKBOX', 'DROPDOWN', 'IMAGE', 'MULTIPLE')`,
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
