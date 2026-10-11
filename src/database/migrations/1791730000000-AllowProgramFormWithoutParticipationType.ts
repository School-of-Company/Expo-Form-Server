import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowProgramFormWithoutParticipationType1791730000000 implements MigrationInterface {
  name = 'AllowProgramFormWithoutParticipationType1791730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 프로그램용 폼은 참여자군 없이 저장할 수 있다. 대상 역할은 박람회 서비스 회차의 allowedOccupations가 정한다.
    // 등록용 폼은 계속 값이 있다(DTO 검증과 purpose 필터가 보장한다).
    await queryRunner.query(
      `ALTER TABLE "form" ALTER COLUMN "participation_type" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 참여자군이 null인 폼이 남아 있으면 NOT NULL을 복원할 수 없다. 폼을 대신 지우면 데이터가 사라지므로 지우지
    // 않고, 원인을 알 수 있는 메시지로 멈춘다. 운영자가 폼을 정리한 뒤 다시 되돌린다.
    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS "count" FROM "form" WHERE "participation_type" IS NULL`,
    )) as Array<{ count: number }>;
    if (count > 0) {
      throw new Error(
        `참여자군이 없는 프로그램용 폼 ${count}개가 남아 있어 되돌릴 수 없습니다. 폼을 먼저 정리해 주세요.`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "form" ALTER COLUMN "participation_type" SET NOT NULL`,
    );
  }
}
