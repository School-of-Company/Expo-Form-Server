import { MigrationInterface, QueryRunner } from 'typeorm';

/** 필드를 옮길 부모 테이블과 옛 필드 테이블. 폼과 설문은 `dynamicFormType` 하나만 다르다. */
const TARGETS = [
  {
    parent: 'form',
    column: 'fields',
    child: 'dynamic_form',
    fk: 'form_id',
    check: 'CHK_form_fields_valid',
    extra: [
      {
        key: 'dynamicFormType',
        column: 'dynamic_form_type',
        type: 'dynamic_form_dynamic_form_type_enum',
      },
    ],
  },
  {
    parent: 'survey',
    column: 'questions',
    child: 'dynamic_survey',
    fk: 'survey_id',
    check: 'CHK_survey_questions_valid',
    extra: [],
  },
] as const;

/**
 * 폼 필드(`dynamic_form`)와 설문 문항(`dynamic_survey`)을 부모 행의 jsonb 배열(`form.fields`, `survey.questions`)로
 * 옮긴다. 배열 원소는 API 응답과 같은 키를 쓰고, 순서는 지금의 표시 순서인 id 오름차순이다.
 *
 * 필드 id는 답변 키·보호자 정책·공개 설문 내려받기가 쓰는 외부 계약이라 값을 그대로 옮긴다. 새 id는 계속 옛 테이블의
 * 시퀀스에서 받으므로, 다음 릴리스에서 옛 테이블을 지울 때 시퀀스가 함께 지워지지 않게 소유를 끊는다. 기본키가
 * 지켜 주던 유일성은 CHECK(`dynamic_fields_valid`)가 대신 지킨다.
 *
 * 옛 테이블은 코드 롤백 대비로 남겨 두고 더 쓰지 않는다. `down`은 전환 뒤 바뀐 필드를 옛 테이블에 되돌려 쓴다.
 */
export class EmbedDynamicFields1792600000000 implements MigrationInterface {
  name = 'EmbedDynamicFields1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CHECK에는 서브쿼리를 못 쓰므로 함수로 검사한다. id가 양의 int4 정수이고 배열 안에서 겹치지 않아야 한다.
    await queryRunner.query(`
      CREATE FUNCTION "dynamic_fields_valid"(fields jsonb) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE WHEN jsonb_typeof(fields) IS DISTINCT FROM 'array' THEN false
        ELSE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(fields) e
          WHERE CASE WHEN jsonb_typeof(e -> 'id') = 'number'
            THEN (e ->> 'id')::numeric <= 0
              OR (e ->> 'id')::numeric > 2147483647
              OR (e ->> 'id')::numeric % 1 <> 0
            ELSE true END
        ) AND (
          SELECT count(*) = count(DISTINCT e -> 'id') FROM jsonb_array_elements(fields) e
        ) END
      $$`);

    for (const t of TARGETS) {
      const extraKeys = t.extra
        .map((x) => `, '${x.key}', d."${x.column}"`)
        .join('');

      await queryRunner.query(
        `ALTER TABLE "${t.parent}" ADD "${t.column}" jsonb`,
      );
      await queryRunner.query(`
        UPDATE "${t.parent}" p SET "${t.column}" = COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', d."id", 'title', d."title", 'formType', d."form_type",
            'requiredStatus', d."required_status", 'jsonData', d."json_data",
            'otherJson', d."other_json"${extraKeys}
          ) ORDER BY d."id")
          FROM "${t.child}" d WHERE d."${t.fk}" = p."id"
        ), '[]'::jsonb)`);

      // 옮긴 (부모, id) 쌍이 옛 테이블과 하나라도 다르면 마이그레이션을 실패시켜 배포를 멈춘다.
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM "${t.child}" d
            FULL JOIN (
              SELECT p."id" AS parent_id, (e ->> 'id')::int AS id
              FROM "${t.parent}" p, jsonb_array_elements(p."${t.column}") e
            ) j ON j.parent_id = d."${t.fk}" AND j.id = d."id"
            WHERE d."id" IS NULL OR j.id IS NULL
          ) THEN
            RAISE EXCEPTION '${t.parent}.${t.column} 백필이 ${t.child}와 다르다';
          END IF;
        END $$`);

      await queryRunner.query(
        `ALTER TABLE "${t.parent}" ALTER COLUMN "${t.column}" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.parent}" ADD CONSTRAINT "${t.check}" CHECK ("dynamic_fields_valid"("${t.column}"))`,
      );
      await queryRunner.query(
        `ALTER SEQUENCE "${t.child}_id_seq" OWNED BY NONE`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of TARGETS) {
      const extraColumns = t.extra.map((x) => `, "${x.column}"`).join('');
      const extraValues = t.extra
        .map((x) => `, (e ->> '${x.key}')::"${x.type}"`)
        .join('');

      // 전환 뒤 바뀐 필드만 옛 테이블에 반영한다. 수정하면 id가 새로 붙으므로 남은 id의 행은 내용이 같다.
      await queryRunner.query(`
        DELETE FROM "${t.child}" d WHERE NOT EXISTS (
          SELECT 1 FROM "${t.parent}" p, jsonb_array_elements(p."${t.column}") e
          WHERE p."id" = d."${t.fk}" AND (e ->> 'id')::int = d."id"
        )`);
      await queryRunner.query(`
        INSERT INTO "${t.child}" ("id", "title", "form_type", "required_status", "json_data", "other_json"${extraColumns}, "${t.fk}")
        SELECT (e ->> 'id')::int, e ->> 'title', (e ->> 'formType')::"${t.child}_form_type_enum",
          (e ->> 'requiredStatus')::boolean, e -> 'jsonData', NULLIF(e -> 'otherJson', 'null'::jsonb)${extraValues}, p."id"
        FROM "${t.parent}" p, jsonb_array_elements(p."${t.column}") e
        ON CONFLICT ("id") DO NOTHING`);

      await queryRunner.query(
        `ALTER SEQUENCE "${t.child}_id_seq" OWNED BY "${t.child}"."id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.parent}" DROP CONSTRAINT "${t.check}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.parent}" DROP COLUMN "${t.column}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION "dynamic_fields_valid"(jsonb)`);
  }
}
