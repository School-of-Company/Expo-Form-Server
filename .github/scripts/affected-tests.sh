#!/usr/bin/env bash
# PR에서 vitest --changed가 고른 테스트 파일(실행)과 고르지 않은 파일(스킵)을 잡 요약에 남긴다.
# 사용: affected-tests.sh <제목> <base ref> [vitest 옵션...]   예) affected-tests.sh "단위 테스트" origin/develop
set -euo pipefail

title=$1
base=$2
shift 2

list() { pnpm exec vitest list --filesOnly "$@" | sed "s#^$PWD/##" | sort -u; }

all=$(list "$@")
run=$(list "$@" --changed "$base")
skip=$(comm -23 <(printf '%s\n' "$all") <(printf '%s\n' "$run"))
changed=$(git diff --name-only "$base")

count() { grep -c . <<<"$1" || true; }
block() {
  if [[ -n "$2" ]]; then
    printf '<details><summary>%s (%s)</summary>\n\n```\n%s\n```\n</details>\n\n' "$1" "$(count "$2")" "$2"
  fi
}

summary=$(
  printf '### %s 영향 범위 (기준: `%s`)\n\n' "$title" "$base"
  printf '변경 파일 %s개 → 실행 **%s** · 스킵 **%s** (전체 %s)\n\n' \
    "$(count "$changed")" "$(count "$run")" "$(count "$skip")" "$(count "$all")"
  block '변경 파일' "$changed"
  block '실행' "$run"
  block '스킵' "$skip"
)

printf '%s\n' "$summary"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '%s\n' "$summary" >>"$GITHUB_STEP_SUMMARY"
fi
