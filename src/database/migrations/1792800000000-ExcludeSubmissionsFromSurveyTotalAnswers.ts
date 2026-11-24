import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 로그인/SMS 답변 접수가 설문 행의 `total_answers`를 늘리지 않고 접수 기록 수로 세어지도록 바뀌었다. 지금까지
 * 접수가 더해 둔 몫(거절되지 않은 접수 기록 수)을 빼서, 이 값이 공개 링크 답변(과 옛 종이 QR 답변) 수만 남게 한다.
 */
export class ExcludeSubmissionsFromSurveyTotalAnswers1792800000000 implements MigrationInterface {
  name = 'ExcludeSubmissionsFromSurveyTotalAnswers1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "survey" s SET "total_answers" = s."total_answers" - (SELECT count(*) FROM "survey_answer_submission" a WHERE a."survey_id" = s."id" AND a."status" <> 'REJECTED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "survey" s SET "total_answers" = s."total_answers" + (SELECT count(*) FROM "survey_answer_submission" a WHERE a."survey_id" = s."id" AND a."status" <> 'REJECTED')`,
    );
  }
}
