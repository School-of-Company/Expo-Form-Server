#!/usr/bin/env bash
# 성능 지표를 재고 결과를 표로 보여 준다(report/metric-usage.md). 사용: pnpm perf:measure
#
# - DATABASE_URL이 없으면 임시 Postgres 컨테이너를 띄우고 끝나면 지운다(Docker 필요).
# - 결과 JSON은 $RUNNER_TEMP/perf-metrics/에 쓴다. RUNNER_TEMP가 없으면 임시 폴더를 만들어 쓰고, 다시 볼 수 있게 남긴다.
# - 측정이 실패해도 결과 파일이 있으면 표를 보여 주고, 종료 코드는 측정 결과를 따른다.
set -euo pipefail

# --- 프로젝트 설정 ---
VITEST_CONFIG=./vitest.config.metrics.ts
PG_IMAGE=postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
# --------------------

cd "$(dirname "$0")/.."
container=""
cleanup() {
  [[ -n "$container" ]] && docker rm -f "$container" >/dev/null 2>&1
  return 0
}
trap cleanup EXIT

if [[ -z "${RUNNER_TEMP:-}" ]]; then
  RUNNER_TEMP=$(mktemp -d)
  export RUNNER_TEMP
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  container=$(docker run -d -e POSTGRES_PASSWORD=postgres -p 127.0.0.1::5432 "$PG_IMAGE")
  port=$(docker port "$container" 5432/tcp | head -n 1 | sed 's/.*://')
  for _ in $(seq 1 30); do
    docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${port}/postgres"
fi

status=0
pnpm exec vitest run --config "$VITEST_CONFIG" || status=$?
node perf/print-report.mjs "$RUNNER_TEMP/perf-metrics" || true
exit "$status"
