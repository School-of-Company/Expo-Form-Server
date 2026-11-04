#!/usr/bin/env bash
# 변형을 번갈아 실행해 시간대 편향을 줄인다. 시나리오 2개 × 변형 2개 × 3회. 사용: WORK=... ./matrix.sh
set -uo pipefail

WORK=${WORK:-/tmp/outbox-relay-loadtest}
export WORK
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WORK/out" "$WORK/logs"

for r in 1 2 3; do
  for scenario in fault drain; do
    for variant in before after; do
      echo "== run $r $scenario $variant $(date +%T)"
      node "$here/run.mjs" "$variant" "$scenario" "r$r" "$WORK/out/$variant-$scenario-r$r.json" > /dev/null \
        2> "$WORK/logs/stderr-$variant-$scenario-r$r.txt" || echo "FAILED $variant $scenario r$r"
      sleep 2
    done
  done
done
echo "== done $(date +%T)"
