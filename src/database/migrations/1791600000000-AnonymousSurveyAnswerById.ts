import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 익명 설문 응답(`survey_qr_answer`)의 키를 `(survey_id, token)`에서 응답마다 만든 `id`로 바꾼다. 토큰이
 * 없는 공개 링크 응답을 담으려고 `token`을 비울 수 있게 하고, 종이 QR의 토큰당 1회 응답은
 * `(survey_id, token)` 부분 유니크 인덱스로 그대로 지킨다. 기존 행은 모두 보존되고 `id`가 새로 채워진다.
 *
 * `down`은 토큰이 없는 공개 링크 응답을 지운 뒤 예전 키로 되돌린다 — 되돌리면 그 응답은 사라진다.
 */
export class AnonymousSurveyAnswerById1791600000000 implements MigrationInterface {
  name = 'AnonymousSurveyAnswerById1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" DROP CONSTRAINT "PK_11bafca6e0ee9765e6ee7c0adcb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ADD CONSTRAINT "PK_56a2bf7dfb0e9f9fadfa1360bcd" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ALTER COLUMN "token" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0e922ffe122dc857705c67b1ad" ON "survey_qr_answer" ("survey_id", "token") WHERE "token" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "survey_qr_answer" WHERE "token" IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0e922ffe122dc857705c67b1ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" DROP CONSTRAINT "PK_56a2bf7dfb0e9f9fadfa1360bcd"`,
    );
    await queryRunner.query(`ALTER TABLE "survey_qr_answer" DROP COLUMN "id"`);
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ALTER COLUMN "token" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ADD CONSTRAINT "PK_11bafca6e0ee9765e6ee7c0adcb" PRIMARY KEY ("survey_id", "token")`,
    );
  }
}
