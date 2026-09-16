#!/bin/bash
set -e

TITLE="${1:?Error: PR title is required. Usage: create-pr.sh <title> <body-file> [label1,label2,...]}"
BODY_FILE="${2:?Error: Body file is required. Usage: create-pr.sh <title> <body-file> [label1,label2,...]}"
LABELS="${3:-}"

if [ ! -f "$BODY_FILE" ]; then
  echo "ERROR: Body file not found: $BODY_FILE" >&2
  exit 1
fi

# Git Flow: any feature branch targets develop, develop targets main.
# Branch names follow the git-commit skill's <type>/<description> form
# (feat/, fix/, refactor/, docs/, chore/, test/), so match on the exceptions
# rather than on a prefix list that would silently miss a new type.
CURRENT=$(git branch --show-current)
case "$CURRENT" in
  develop) BASE="main" ;;
  main)
    echo "ERROR: main에서는 PR을 만들 수 없습니다. 피처 브랜치를 먼저 만드세요." >&2
    exit 1
    ;;
  "")
    echo "ERROR: detached HEAD 상태입니다. 브랜치를 체크아웃하세요." >&2
    exit 1
    ;;
  *) BASE="develop" ;;
esac

if ! git ls-remote --exit-code --heads origin "$BASE" >/dev/null 2>&1; then
  echo "ERROR: base 브랜치 '$BASE'가 origin에 없습니다." >&2
  echo "       git branch $BASE main && git push -u origin $BASE" >&2
  exit 1
fi

ARGS=(gh pr create --title "$TITLE" --body-file "$BODY_FILE" --base "$BASE")

if [ -n "$LABELS" ]; then
  IFS=',' read -ra LABEL_ARRAY <<< "$LABELS"
  for label in "${LABEL_ARRAY[@]}"; do
    trimmed=$(echo "$label" | xargs)
    [ -n "$trimmed" ] && ARGS+=(--label "$trimmed")
  done
fi

echo "Creating PR..."
echo "  Title : $TITLE"
echo "  Base  : $BASE"
[ -n "$LABELS" ] && echo "  Labels: $LABELS"
echo ""

"${ARGS[@]}"
