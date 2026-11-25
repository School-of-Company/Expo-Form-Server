#!/usr/bin/env bash
# 마이그레이션을 다 적용한 DB와 엔티티를 비교해, 마이그레이션으로 만들지 않은 스키마 차이가 있으면 실패한다.
# `pnpm run migration:run`(빌드 포함)이 먼저 돌아 dist가 있어야 한다.
set -euo pipefail

# 마이그레이션에서만 관리하는 제약. 엔티티에 선언하면 synchronize가 함수(dynamic_fields_valid) 없이 만들려다 실패한다
# (1792600000000-EmbedDynamicFields).
allowed='"CHK_form_fields_valid"|"CHK_survey_questions_valid"'

out=$(pnpm typeorm migration:generate src/database/migrations/Drift -d dist/database/data-source.js --dryrun 2>&1 || true)
drift=$(grep -F 'queryRunner.query(' <<<"$out" | grep -vE "$allowed" || true)

if [[ -n "$drift" ]]; then
  echo "엔티티와 마이그레이션 스키마가 다릅니다. 마이그레이션을 생성하세요(pnpm migration:generate)." >&2
  printf '%s\n' "$drift" >&2
  exit 1
fi

if ! grep -qE 'queryRunner.query\(|No changes in database schema' <<<"$out"; then
  printf '%s\n' "$out" >&2
  echo "차이 확인 결과를 해석하지 못했습니다." >&2
  exit 1
fi

echo "엔티티와 마이그레이션 스키마가 일치합니다."
