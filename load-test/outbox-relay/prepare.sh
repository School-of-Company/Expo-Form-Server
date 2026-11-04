#!/usr/bin/env bash
# Before/After 두 시점의 코드를 추출해 빌드한다. 사용: ./prepare.sh (환경변수: BEFORE_REF, AFTER_REF, WORK)
set -euo pipefail

BEFORE_REF=${BEFORE_REF:-6897028^1} # PR #266 직전
AFTER_REF=${AFTER_REF:-6897028}     # PR #266 머지 커밋
WORK=${WORK:-/tmp/outbox-relay-loadtest}
repo=$(git rev-parse --show-toplevel)

rm -rf "$WORK"
mkdir -p "$WORK/before" "$WORK/after"
git -C "$repo" archive "$BEFORE_REF" | tar -x -C "$WORK/before"
git -C "$repo" archive "$AFTER_REF" | tar -x -C "$WORK/after"

# node_modules를 한 벌만 설치해 두 빌드가 공유한다. 의존성이 다르면 비교가 성립하지 않는다.
if ! diff -q "$WORK/before/pnpm-lock.yaml" "$WORK/after/pnpm-lock.yaml" > /dev/null; then
  echo "두 시점의 pnpm-lock.yaml이 달라 node_modules를 공유할 수 없습니다." >&2
  exit 1
fi

(cd "$WORK/after" && pnpm install --frozen-lockfile && pnpm build)
ln -sfn "$WORK/after/node_modules" "$WORK/before/node_modules"
# 공유한 node_modules는 pnpm의 의존성 상태 검사를 통과하지 못해 `pnpm build` 대신 nest를 바로 부른다.
(cd "$WORK/before" && ./node_modules/.bin/nest build)

echo "준비 완료: $WORK"
