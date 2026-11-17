-- 부하 측정용 시드. 박람회 200개마다 등록 폼(STANDARD·PRE) 1개와 일반 참가자 설문 1개, 각각 필드 20개.
-- 측정 대상은 첫 박람회(11111111-1111-4111-8111-111111111111)이고, 나머지는 테이블에 현실적인 행 수를 주려는 것이다.
-- 필드 순서는 삽입 순서(= id 오름차순)로 정해진다.
BEGIN;

TRUNCATE form, survey CASCADE;

CREATE TEMP TABLE seed_expo AS
SELECT g AS n,
       CASE WHEN g = 1 THEN '11111111-1111-4111-8111-111111111111'::uuid ELSE md5('expo' || g)::uuid END AS expo_id
FROM generate_series(1, 200) g;

-- 필드 20개의 모양. 1·2번은 이름·전화번호(문장형), 나머지는 드롭다운·체크박스·문장형을 섞는다.
CREATE TEMP TABLE seed_field AS
SELECT n,
       '문항 ' || n AS title,
       CASE WHEN n <= 2 THEN 'SENTENCE' WHEN n % 3 = 0 THEN 'DROPDOWN' WHEN n % 3 = 1 THEN 'CHECKBOX' ELSE 'SENTENCE' END AS form_type,
       n % 2 = 0 AS required_status,
       CASE WHEN n > 2 AND n % 3 <> 2
            THEN '{"1":"선택지 하나","2":"선택지 둘","3":"선택지 셋","4":"선택지 넷","5":{"value":"기타","isAlwaysSelected":false}}'::jsonb
            ELSE '{}'::jsonb END AS json_data,
       CASE WHEN n > 2 AND n % 3 = 1 THEN '{"hasEtc":true,"maxSelection":2}'::jsonb ELSE NULL END AS other_json,
       CASE n WHEN 1 THEN 'NAME' WHEN 2 THEN 'PHONE_NUMBER' ELSE 'DEFAULT' END AS dynamic_form_type
FROM generate_series(1, 20) n;

INSERT INTO form (title, information_text, participation_type, application_type, start_date, end_date, expo_id, purpose, version)
SELECT '부하 측정 폼 ' || e.n, '안내', 'STANDARD', 'PRE', now() - interval '1 day', now() + interval '30 days', e.expo_id, 'REGISTRATION', 1
FROM seed_expo e;

INSERT INTO dynamic_form (title, form_type, required_status, json_data, other_json, dynamic_form_type, created_at, updated_at, form_id)
SELECT s.title, s.form_type::dynamic_form_form_type_enum, s.required_status, s.json_data, s.other_json,
       s.dynamic_form_type::dynamic_form_dynamic_form_type_enum, now(), now(), f.id
FROM form f JOIN seed_expo e ON e.expo_id = f.expo_id CROSS JOIN seed_field s
ORDER BY e.n, s.n;

INSERT INTO survey (title, information_text, participation_type, expo_id)
SELECT '부하 측정 설문 ' || e.n, '안내', 'STANDARD', e.expo_id
FROM seed_expo e;

INSERT INTO dynamic_survey (title, form_type, required_status, json_data, other_json, created_at, updated_at, survey_id)
SELECT s.title, s.form_type::dynamic_survey_form_type_enum, s.required_status, s.json_data, s.other_json, now(), now(), v.id
FROM survey v JOIN seed_expo e ON e.expo_id = v.expo_id CROSS JOIN seed_field s
ORDER BY e.n, s.n;

COMMIT;
ANALYZE;
