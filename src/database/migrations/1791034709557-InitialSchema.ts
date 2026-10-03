import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791034709557 implements MigrationInterface {
  name = 'InitialSchema1791034709557';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `uuid_generate_v4()`(uuid PK 기본값)가 이 확장에 있다. TypeORM이 접속 때 자동으로 만들어 주지만,
    // 의존을 드러내고 확장 설치 권한이 없는 DB에서 어디서 막히는지 바로 보이도록 명시한다.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."form_participation_type_enum" AS ENUM('TRAINEE', 'STANDARD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."form_application_type_enum" AS ENUM('PRE', 'FIELD')`,
    );
    await queryRunner.query(
      `CREATE TABLE "form" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(100) NOT NULL, "information_text" character varying(500) NOT NULL, "participation_type" "public"."form_participation_type_enum" NOT NULL, "application_type" "public"."form_application_type_enum" NOT NULL, "start_date" TIMESTAMP WITH TIME ZONE NOT NULL, "end_date" TIMESTAMP WITH TIME ZONE NOT NULL, "expo_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8f72b95aa2f8ba82cf95dc7579e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_070df093aff8bb1e5bad032778" ON "form"  ("expo_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b26c89fc669ce579771d408cd9" ON "form"  ("expo_id", "participation_type", "application_type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_form_form_type_enum" AS ENUM('SENTENCE', 'CHECKBOX', 'DROPDOWN', 'IMAGE', 'MULTIPLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_form_dynamic_form_type_enum" AS ENUM('NAME', 'PHONE_NUMBER', 'TRAINING_ID', 'DEFAULT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dynamic_form" ("id" SERIAL NOT NULL, "title" character varying(100) NOT NULL, "form_type" "public"."dynamic_form_form_type_enum" NOT NULL, "required_status" boolean NOT NULL, "json_data" jsonb NOT NULL, "other_json" jsonb, "dynamic_form_type" "public"."dynamic_form_dynamic_form_type_enum" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "form_id" uuid NOT NULL, CONSTRAINT "PK_7d6b0f580ddef63c8ae2abb0f4c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c34064025fdd9312912d11c6a7" ON "dynamic_form"  ("form_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."survey_participation_type_enum" AS ENUM('TRAINEE', 'STANDARD')`,
    );
    await queryRunner.query(
      `CREATE TABLE "survey" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(100) NOT NULL, "information_text" character varying(500) NOT NULL, "participation_type" "public"."survey_participation_type_enum" NOT NULL, "total_answers" integer NOT NULL DEFAULT '0', "expo_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f0da32b9181e9c02ecf0be11ed3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_28ac906289a01e2c922ce18d2d" ON "survey"  ("expo_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97c087fb8293f50f3ec8ac5ccc" ON "survey"  ("expo_id", "participation_type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_survey_form_type_enum" AS ENUM('SENTENCE', 'CHECKBOX', 'DROPDOWN', 'IMAGE', 'MULTIPLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dynamic_survey" ("id" SERIAL NOT NULL, "title" character varying(100) NOT NULL, "form_type" "public"."dynamic_survey_form_type_enum" NOT NULL, "required_status" boolean NOT NULL, "json_data" jsonb NOT NULL, "other_json" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "survey_id" uuid NOT NULL, CONSTRAINT "PK_c221ac12eba1a0673e4513a4842" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6f1983b450e95b692c71db416c" ON "dynamic_survey"  ("survey_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."survey_answer_submission_participation_type_enum" AS ENUM('TRAINEE', 'STANDARD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."survey_answer_submission_status_enum" AS ENUM('RECEIVED', 'PUBLISHED', 'STORED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_answer_submission" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "survey_id" uuid NOT NULL, "expo_id" uuid NOT NULL, "participation_type" "public"."survey_answer_submission_participation_type_enum" NOT NULL, "phone_number" character varying(20) NOT NULL, "event_id" uuid NOT NULL, "status" "public"."survey_answer_submission_status_enum" NOT NULL, "reject_reason" text, "retry_count" integer NOT NULL DEFAULT '0', "published_at" TIMESTAMP WITH TIME ZONE, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c8d87cc3639cb99ce2ba69bf5cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6bea5b9e1b12fd10c23809a58" ON "survey_answer_submission"  ("survey_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_990d3828a77773097deb1b8dbc" ON "survey_answer_submission"  ("event_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fb11ad9f5983ee6ce7990df178" ON "survey_answer_submission"  ("survey_id", "phone_number") WHERE status <> 'REJECTED'`,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_qr_answer" ("survey_id" uuid NOT NULL, "token" character varying(64) NOT NULL, "answers" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_11bafca6e0ee9765e6ee7c0adcb" PRIMARY KEY ("survey_id", "token"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_form" ADD CONSTRAINT "FK_c34064025fdd9312912d11c6a70" FOREIGN KEY ("form_id") REFERENCES "form"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_survey" ADD CONSTRAINT "FK_6f1983b450e95b692c71db416c4" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" ADD CONSTRAINT "FK_3f92caac769ae04a82aeea7e56c" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_qr_answer" DROP CONSTRAINT "FK_3f92caac769ae04a82aeea7e56c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_survey" DROP CONSTRAINT "FK_6f1983b450e95b692c71db416c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_form" DROP CONSTRAINT "FK_c34064025fdd9312912d11c6a70"`,
    );
    await queryRunner.query(`DROP TABLE "survey_qr_answer"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fb11ad9f5983ee6ce7990df178"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_990d3828a77773097deb1b8dbc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6bea5b9e1b12fd10c23809a58"`,
    );
    await queryRunner.query(`DROP TABLE "survey_answer_submission"`);
    await queryRunner.query(
      `DROP TYPE "public"."survey_answer_submission_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."survey_answer_submission_participation_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6f1983b450e95b692c71db416c"`,
    );
    await queryRunner.query(`DROP TABLE "dynamic_survey"`);
    await queryRunner.query(
      `DROP TYPE "public"."dynamic_survey_form_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97c087fb8293f50f3ec8ac5ccc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_28ac906289a01e2c922ce18d2d"`,
    );
    await queryRunner.query(`DROP TABLE "survey"`);
    await queryRunner.query(
      `DROP TYPE "public"."survey_participation_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c34064025fdd9312912d11c6a7"`,
    );
    await queryRunner.query(`DROP TABLE "dynamic_form"`);
    await queryRunner.query(
      `DROP TYPE "public"."dynamic_form_dynamic_form_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."dynamic_form_form_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b26c89fc669ce579771d408cd9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_070df093aff8bb1e5bad032778"`,
    );
    await queryRunner.query(`DROP TABLE "form"`);
    await queryRunner.query(`DROP TYPE "public"."form_application_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."form_participation_type_enum"`,
    );
  }
}
