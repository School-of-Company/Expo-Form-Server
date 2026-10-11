import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormPurposeAndVersion1791696982117 implements MigrationInterface {
  name = 'AddFormPurposeAndVersion1791696982117';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b26c89fc669ce579771d408cd9"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."form_purpose_enum" AS ENUM('REGISTRATION', 'PROGRAM')`,
    );
    await queryRunner.query(
      `ALTER TABLE "form" ADD "purpose" "public"."form_purpose_enum" NOT NULL DEFAULT 'REGISTRATION'`,
    );
    await queryRunner.query(
      `ALTER TABLE "form" ADD "version" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5be99813bedf9c1a274b474dd1" ON "form"  ("expo_id", "participation_type", "application_type") WHERE "purpose" = 'REGISTRATION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5be99813bedf9c1a274b474dd1"`,
    );
    await queryRunner.query(`ALTER TABLE "form" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "form" DROP COLUMN "purpose"`);
    await queryRunner.query(`DROP TYPE "public"."form_purpose_enum"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b26c89fc669ce579771d408cd9" ON "form" USING btree ("application_type", "expo_id", "participation_type") `,
    );
  }
}
