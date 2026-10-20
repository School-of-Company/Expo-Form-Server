import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 설문의 경품 추첨에 참여한 번호(`survey_lottery_participant`). 번호마다 설문당 한 번만 순번을 소비하게 한다(#182).
 * 설문이 지워지면 함께 지워진다.
 *
 * 이미 번호가 남아 있는 당첨 결과의 번호를 채워 넣어, 그 번호가 다시 순번을 소비하지 않게 한다. 당첨되지 않은
 * 참여 번호는 이전에 저장하지 않았으므로 채울 수 없다.
 */
export class AddSurveyLotteryParticipant1792000000000 implements MigrationInterface {
  name = 'AddSurveyLotteryParticipant1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "survey_lottery_participant" ("survey_id" uuid NOT NULL, "phone_number" character varying(11) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_29bd791ec77d2f5abf4d2b14788" PRIMARY KEY ("survey_id", "phone_number"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_lottery_participant" ADD CONSTRAINT "FK_e80ab31593bef63ccb708556927" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "survey_lottery_participant" ("survey_id", "phone_number") SELECT DISTINCT "survey_id", "phone_number" FROM "survey_draw_result" WHERE "phone_number" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_lottery_participant" DROP CONSTRAINT "FK_e80ab31593bef63ccb708556927"`,
    );
    await queryRunner.query(`DROP TABLE "survey_lottery_participant"`);
  }
}
