#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
if [[ "$TOOL_NAME" == "Edit" ]] || [[ "$TOOL_NAME" == "Write" ]]; then
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    CWD=$(echo "$INPUT" | jq -r '.cwd')
    [[ "$FILE_PATH" = /* ]] || FILE_PATH="$CWD/$FILE_PATH"
    case "$FILE_PATH" in
        *.js|*.ts|*.jsx|*.tsx|*.mjs|*.cjs)
            if ! compgen -G "$CWD/oxlint.json" > /dev/null 2>&1 && \
               ! compgen -G "oxlint.json" > /dev/null 2>&1; then
                exit 0
            fi
            OXLINT="$CWD/node_modules/.bin/oxlint"
            [[ -x "$OXLINT" ]] || OXLINT="node_modules/.bin/oxlint"
            [[ -x "$OXLINT" ]] || OXLINT="npx --no-install oxlint"
            echo "[Hook] Running oxlint --fix for $(basename "$FILE_PATH")" >&2
            if $OXLINT --fix "$FILE_PATH" 2>&1; then
                echo "[Hook] oxlint OK" >&2
            else
                echo "[Hook] oxlint failed" >&2
            fi
            ;;
    esac
fi
exit 0
