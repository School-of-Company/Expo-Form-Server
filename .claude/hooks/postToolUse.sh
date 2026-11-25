#!/bin/bash
INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULES_DIR="$SCRIPT_DIR/modules"

[[ -d "$MODULES_DIR" ]] || exit 0

# 모듈이 exit 2(에이전트에게 고칠 것을 돌려줌)를 내면 다른 모듈은 마저 돌리고 마지막에 2로 끝낸다.
STATUS=0
for hook in "$MODULES_DIR"/*/postToolUse.sh; do
    [[ -f "$hook" ]] || continue
    printf "%s\n" "$INPUT" | bash "$hook" || { [[ $? -eq 2 ]] && STATUS=2; }
done

exit $STATUS
