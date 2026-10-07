import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSurveyQrAnswerOccupation1791293237293 implements MigrationInterface {
    name = 'AddSurveyQrAnswerOccupation1791293237293'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."survey_qr_answer_occupation_enum" AS ENUM('ELEMENTARY_STUDENT', 'MIDDLE_SCHOOL_STUDENT', 'HIGH_SCHOOL_STUDENT', 'SCHOOL_STAFF', 'PRE_SERVICE_TEACHER', 'PARENT', 'GENERAL', 'TEACHER')`);
        await queryRunner.query(`ALTER TABLE "survey_qr_answer" ADD "occupation" "public"."survey_qr_answer_occupation_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "survey_qr_answer" DROP COLUMN "occupation"`);
        await queryRunner.query(`DROP TYPE "public"."survey_qr_answer_occupation_enum"`);
    }

}
