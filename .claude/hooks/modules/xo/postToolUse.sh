#!/bin/bash
# XO를 쓰는 프로젝트에서 JS/TS 파일을 편집하면 그 파일만 xo --fix로 검사한다. CI에서 린트를 돌리지 않으므로
# 남은 오류는 exit 2로 에이전트에게 돌려줘 바로 고치게 한다.
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
[[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" ]] || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
[[ -n "$FILE_PATH" ]] || exit 0
[[ "$FILE_PATH" = /* ]] || FILE_PATH="$CWD/$FILE_PATH"

case "$FILE_PATH" in
    *.js|*.mjs|*.cjs|*.ts|*.mts|*.cts) ;;
    *) exit 0 ;;
esac

ROOT=$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
compgen -G "$ROOT/xo.config.*" > /dev/null 2>&1 || exit 0
XO="$ROOT/node_modules/.bin/xo"
[[ -x "$XO" ]] || exit 0

if OUTPUT=$(cd "$ROOT" && "$XO" --fix "$FILE_PATH" 2>&1); then
    echo "[Hook] xo OK" >&2
    exit 0
fi

echo "[Hook] xo 오류가 남아 있습니다. 고쳐 주세요: $(basename "$FILE_PATH")" >&2
echo "$OUTPUT" | tail -30 >&2
exit 2
