import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSurveyLottery1791700000000 implements MigrationInterface {
  name = 'AddSurveyLottery1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "survey_lottery_entry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "survey_id" uuid NOT NULL, "phone_number" character varying(11) NOT NULL, "sequence" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fd7d455318126edec41c3502de6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_941c820240a2244997e7312cae" ON "survey_lottery_entry"  ("survey_id", "sequence") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_41cd47b03b8f881eeb84ed1ac1" ON "survey_lottery_entry"  ("survey_id", "phone_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_draw_result" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_id" uuid NOT NULL, "survey_id" uuid NOT NULL, "draw_number" integer NOT NULL, "phone_number" character varying(11) NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_0a0fa66854c4edf1b03897dbf5e" UNIQUE ("event_id"), CONSTRAINT "PK_8255a959e4ca2a31145dae0fe41" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_351c9000711fb492ac02945904" ON "survey_draw_result"  ("survey_id", "draw_number") `,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD "lottery_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD "lottery_numbers" integer array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD "lottery_sequence" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_lottery_entry" ADD CONSTRAINT "FK_de2e6afd25cd0151f851e825bc0" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_draw_result" ADD CONSTRAINT "FK_d3833c0535d9df80e53f4cf5ad6" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_draw_result" DROP CONSTRAINT "FK_d3833c0535d9df80e53f4cf5ad6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_lottery_entry" DROP CONSTRAINT "FK_de2e6afd25cd0151f851e825bc0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" DROP COLUMN "lottery_sequence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" DROP COLUMN "lottery_numbers"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" DROP COLUMN "lottery_enabled"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_351c9000711fb492ac02945904"`,
    );
    await queryRunner.query(`DROP TABLE "survey_draw_result"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_41cd47b03b8f881eeb84ed1ac1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_941c820240a2244997e7312cae"`,
    );
    await queryRunner.query(`DROP TABLE "survey_lottery_entry"`);
  }
}
