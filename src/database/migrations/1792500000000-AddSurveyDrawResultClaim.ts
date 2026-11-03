import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 당첨 결과 릴레이가 발행하는 동안 행 잠금을 쥐지 않도록, 잡아 둔 기한(`claimed_until`)을 둔다. 기존 행은 비어 있어
 * 바로 발행 대상이 된다.
 */
export class AddSurveyDrawResultClaim1792500000000 implements MigrationInterface {
  name = 'AddSurveyDrawResultClaim1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_draw_result" ADD "claimed_until" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_draw_result" DROP COLUMN "claimed_until"`,
    );
  }
}
