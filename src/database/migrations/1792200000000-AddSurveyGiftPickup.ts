import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 공개 설문 응답별 기념품 수령 확인(#239). 설문별 직원 PIN 해시(`survey_gift_pin`)와 응답별 수령 기록
 * (`survey_gift_claim`)을 새로 만든다. 기존 테이블은 바꾸지 않고, 이미 있는 응답에는 수령 기록을 만들지 않는다.
 */
export class AddSurveyGiftPickup1792200000000 implements MigrationInterface {
  name = 'AddSurveyGiftPickup1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "survey_gift_pin" ("survey_id" uuid NOT NULL, "pin_hash" character varying(200) NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_survey_gift_pin" PRIMARY KEY ("survey_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_gift_pin" ADD CONSTRAINT "FK_f3ffb99a4ac5c6fa27026ddc5dc" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_gift_claim" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "survey_id" uuid NOT NULL, "answer_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "claimed_at" TIMESTAMP WITH TIME ZONE, "failed_attempts" integer NOT NULL DEFAULT 0, "locked_until" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_survey_gift_claim_answer" UNIQUE ("answer_id"), CONSTRAINT "UQ_survey_gift_claim_token" UNIQUE ("token_hash"), CONSTRAINT "PK_survey_gift_claim" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_gift_claim" ADD CONSTRAINT "FK_0054130c4aee16030e5083bf571" FOREIGN KEY ("answer_id") REFERENCES "survey_public_answer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_gift_claim" DROP CONSTRAINT "FK_0054130c4aee16030e5083bf571"`,
    );
    await queryRunner.query(`DROP TABLE "survey_gift_claim"`);
    await queryRunner.query(
      `ALTER TABLE "survey_gift_pin" DROP CONSTRAINT "FK_f3ffb99a4ac5c6fa27026ddc5dc"`,
    );
    await queryRunner.query(`DROP TABLE "survey_gift_pin"`);
  }
}
