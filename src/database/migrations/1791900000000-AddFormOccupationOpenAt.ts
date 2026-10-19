import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 교원·예비교사 외 직업의 사전등록 시작 시각(#164). 이미 있는 폼은 null이라 지금처럼 직업 제한이 없다.
 */
export class AddFormOccupationOpenAt1791900000000 implements MigrationInterface {
  name = 'AddFormOccupationOpenAt1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form" ADD "occupation_open_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form" DROP COLUMN "occupation_open_at"`,
    );
  }
}
