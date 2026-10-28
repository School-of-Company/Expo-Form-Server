import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 박람회 프로젝션(Expo-Expo-Server#212). `expo.expo.changed`로 받은 박람회 기간(`expo_projection`)과 박람회별
 * 마지막 반영 버전(`expo_projection_version`) 테이블을 새로 만든다. 기존 테이블은 바꾸지 않는다.
 */
export class AddExpoProjection1792300000000 implements MigrationInterface {
  name = 'AddExpoProjection1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "expo_projection" ("expo_id" uuid NOT NULL, "started_day" date NOT NULL, "finished_day" date NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_expo_projection" PRIMARY KEY ("expo_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "expo_projection_version" ("expo_id" uuid NOT NULL, "version" bigint NOT NULL, "event_id" uuid NOT NULL, "deleted" boolean NOT NULL, "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_expo_projection_version" PRIMARY KEY ("expo_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "expo_projection_version"`);
    await queryRunner.query(`DROP TABLE "expo_projection"`);
  }
}
