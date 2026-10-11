import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProgramFormSupport1791710000000 implements MigrationInterface {
  name = 'AddProgramFormSupport1791710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 신청 방식이 없는 프로그램용 폼을 저장할 수 있게 한다. 등록용 폼은 계속 값이 있다.
    await queryRunner.query(
      `ALTER TABLE "form" ALTER COLUMN "application_type" DROP NOT NULL`,
    );
    // 프로그램용 폼은 같은 박람회 안에서 제목이 겹치지 않는다.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7df050275d01f25f756c158ee3" ON "form"  ("expo_id", "title") WHERE "purpose" = 'PROGRAM'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 프로그램용 폼(신청 방식이 null)이 남아 있으면 NOT NULL을 복원할 수 없다. 폼을 대신 지우면 데이터가 사라지므로
    // 지우지 않고, 원인을 알 수 있는 메시지로 멈춘다. 운영자가 폼을 정리한 뒤 다시 되돌린다.
    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS "count" FROM "form" WHERE "application_type" IS NULL`,
    )) as Array<{ count: number }>;
    if (count > 0) {
      throw new Error(
        `프로그램용 폼 ${count}개가 남아 있어 되돌릴 수 없습니다. 폼을 먼저 정리해 주세요.`,
      );
    }

    await queryRunner.query(
      `DROP INDEX "public"."IDX_7df050275d01f25f756c158ee3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form" ALTER COLUMN "application_type" SET NOT NULL`,
    );
  }
}
