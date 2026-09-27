#!/bin/bash
set -e

PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null)
if [ -z "$PR_NUMBER" ]; then
  echo "ERROR: No open PR found for current branch." >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)

# 저장소 안에 두면 나중에 git add -A 등에 휩쓸려 실수로 커밋될 수 있으므로,
# 항상 저장소 바깥의 임시 디렉터리에 만든다.
PR_TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/resolve-reviews-pr.XXXXXX")

git fetch origin "$BASE" --quiet 2>/dev/null || true

gh api "repos/$REPO/pulls/$PR_NUMBER/comments" \
  --jq '[.[] | {id, path, line, body, user: .user.login}]' \
  > "$PR_TMP_DIR/pr_comments.json"

git log "origin/$BASE..HEAD" --pretty=format:"%H %h %s" > "$PR_TMP_DIR/pr_commits.txt"

git diff "origin/$BASE...HEAD" --name-only > "$PR_TMP_DIR/pr_changed_files.txt"

git diff "origin/$BASE...HEAD" > "$PR_TMP_DIR/pr_diff.txt"

echo "PR_TMP_DIR=$PR_TMP_DIR"
echo "PR #$PR_NUMBER | Repo: $REPO | Base: $BASE"
echo "Comments: $(jq length "$PR_TMP_DIR/pr_comments.json"), Changed files: $(wc -l < "$PR_TMP_DIR/pr_changed_files.txt" | tr -d ' ')"
