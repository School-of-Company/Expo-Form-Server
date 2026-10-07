import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedExpo1791301155942 implements MigrationInterface {
  name = 'AddDeletedExpo1791301155942';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "deleted_expo" ("expo_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_77bca81f92f5f01f647570293eb" PRIMARY KEY ("expo_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deleted_expo"`);
  }
}
