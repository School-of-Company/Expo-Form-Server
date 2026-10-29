import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 리포트용 공개 응답 커서 페이지(#248)가 설문의 응답을 페이지마다 전부 정렬하지 않도록 `(survey_id, created_at, id)`
 * 인덱스를 둔다. FK 컬럼(`survey_id`)에는 원래 인덱스가 없어서 설문 삭제 CASCADE도 이 인덱스를 쓴다.
 *
 * `CREATE INDEX`는 만드는 동안 해당 테이블의 쓰기를 막는다(마이그레이션이 트랜잭션 안이라 `CONCURRENTLY`를 못 쓴다).
 * 테이블이 매우 크면 배포 전에 한가한 시간에 적용한다.
 */
export class AddSurveyPublicAnswerCursorIndex1792400000000 implements MigrationInterface {
  name = 'AddSurveyPublicAnswerCursorIndex1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_survey_public_answer_cursor" ON "survey_public_answer" ("survey_id", "created_at", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_survey_public_answer_cursor"`,
    );
  }
}
