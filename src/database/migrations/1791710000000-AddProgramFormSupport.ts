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
    // 되돌리기 전에 프로그램용 폼(신청 방식이 null)을 먼저 지워야 한다 — 남아 있으면 NOT NULL 복원이 실패한다.
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7df050275d01f25f756c158ee3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form" ALTER COLUMN "application_type" SET NOT NULL`,
    );
  }
}
