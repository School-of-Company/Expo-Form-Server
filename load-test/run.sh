#!/usr/bin/env bash
# 폼 조회·공개 설문 조회를 도착률 단계별로 재고, 단계마다 DB가 한 일(쿼리 수·돌려준 행 수·읽은 행 수)을 함께 남긴다.
# 사용법: load-test/run.sh <이름>     예) load-test/run.sh as-is
#   앱(PORT, 기본 3100)과 PostgreSQL(pg_stat_statements 로드)이 떠 있고 load-test/seed.sql을 넣은 상태여야 한다.
#   PSQL: psql을 부르는 명령(기본: 로컬 컨테이너 form-load-pg). RATES, DURATION, THREADS로 단계를 바꾼다.
# 결과: load-test/out/<이름>.tsv (단계마다 한 줄), JTL 원본은 load-test/out/<이름>/
set -euo pipefail
cd "$(dirname "$0")"

NAME="${1:?usage: run.sh <name>}"
PSQL="${PSQL:-docker exec -i form-load-pg psql -U app -d expoform -Atq}"
RATES="${RATES:-50 100 150 200 250 300 400}"
DURATION="${DURATION:-30}"
THREADS="${THREADS:-100}"
PORT="${PORT:-3100}"
EXPO_ID="11111111-1111-4111-8111-111111111111"
OUT="out/$NAME"
TSV="out/$NAME.tsv"
mkdir -p "$OUT"

sql() { $PSQL -c "$1"; }
sql "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" >/dev/null

# 측정 대상 테이블에서 읽은 행 수(순차 + 인덱스). 옛 테이블이 없으면 0으로 센다.
tuples_read() {
  sql "SELECT coalesce(sum(coalesce(seq_tup_read,0) + coalesce(idx_tup_fetch,0)),0) FROM pg_stat_user_tables WHERE relname IN ('form','dynamic_form','survey','dynamic_survey')"
}

path_of() {
  case "$1" in
    form) echo "/forms/$EXPO_ID?type=STANDARD&applicationType=PRE" ;;
    survey) echo "/surveys/public/$EXPO_ID" ;;
  esac
}

printf 'target\trate\tcount\terr_pct\trps\tp50_ms\tp95_ms\tp99_ms\tdb_queries_per_req\tdb_rows_per_req\ttuples_read_per_req\n' > "$TSV"
for target in ${TARGETS:-form survey}; do
  path="$(path_of "$target")"
  curl -sf -o /dev/null "http://127.0.0.1:$PORT$path" || { echo "warmup failed: $path" >&2; exit 1; }
  for rate in $RATES; do
    sql "SELECT pg_stat_statements_reset()" >/dev/null
    sleep 2
    before="$(tuples_read)"
    jtl="$OUT/$target-$rate.jtl"
    rm -f "$jtl"
    jmeter -n -t jmeter/read.jmx -Jrate="$rate" -Jduration="$DURATION" -Jthreads="$THREADS" \
      -Jport="$PORT" -Jpath="$path" -Jlabel="$target" -l "$jtl" >/dev/null
    sleep 2
    after="$(tuples_read)"
    summary="$(python3 summarize.py "$jtl")"
    count="$(sed -E 's/.*count=([0-9]+).*/\1/' <<<"$summary")"
    # 앱이 보낸 쿼리만 센다(측정용 pg_stat·확장 쿼리와 트랜잭션 제어문 제외).
    db="$(sql "SELECT coalesce(sum(calls),0)||' '||coalesce(sum(rows),0) FROM pg_stat_statements WHERE query !~* '(pg_stat|pg_extension|^\\s*(BEGIN|COMMIT|ROLLBACK|START|SET|SHOW))'")"
    read -r calls rows <<<"$db"
    line="$(python3 - "$summary" "$calls" "$rows" "$before" "$after" <<'PY'
import sys
summary, calls, rows, before, after = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
kv = dict(part.split("=") for part in summary.split())
n = int(kv["count"])
print("\t".join([kv["count"], kv["err"], kv["rps"], kv["p50"], kv["p95"], kv["p99"],
                 f"{calls / n:.2f}", f"{rows / n:.2f}", f"{(after - before) / n:.2f}"]))
PY
)"
    printf '%s\t%s\t%s\n' "$target" "$rate" "$line" | tee -a "$TSV"
  done
done
