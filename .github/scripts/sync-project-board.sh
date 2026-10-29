#!/usr/bin/env bash
# Expo 서버 레포들의 열린 이슈·PR 중 프로젝트 보드에 없는 것을 추가하고
# Status / Service / Kind / Priority 를 채운다. 이미 보드에 있는 항목은 건드리지 않는다.
# 필요 환경변수: GH_TOKEN(repo, project 권한), OWNER, PROJECT_NUMBER
set -euo pipefail

: "${OWNER:?}" "${PROJECT_NUMBER:?}"

PID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq .id)
FIELDS=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)
EXISTING=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 2000 --format json \
  --jq '[.items[].content.url // empty]')
REPOS=$(gh repo list "$OWNER" --no-archived --limit 200 --json name \
  --jq '.[].name | select(test("^Expo-.*-Server$") or . == "Expo-Gateway")')

set_option() { # item-id field-name option-name
  local f o
  f=$(jq -r --arg f "$2" '.fields[] | select(.name == $f) | .id' <<<"$FIELDS")
  o=$(jq -r --arg f "$2" --arg o "$3" \
    '.fields[] | select(.name == $f) | .options[]? | select(.name == $o) | .id' <<<"$FIELDS")
  if [[ -z $f || -z $o ]]; then
    echo "::warning::필드 옵션을 찾지 못해 건너뜀: $2=$3"
    return 0
  fi
  gh project item-edit --id "$1" --project-id "$PID" --field-id "$f" \
    --single-select-option-id "$o" >/dev/null
}

KIND_JQ='
  if   any(.[]; . == "type:api-contract") then "API Contract"
  elif any(.[]; . == "🐞 Bug" or . == "버그") then "Bug"
  elif any(.[]; . == "✨ Feature") then "Feature"
  elif any(.[]; . == "♻️ Refactor" or . == "⚡️performance") then "Refactor"
  elif any(.[]; . == "🌏 Deploy" or . == "⚙ Setting" or . == "type:infra") then "Infra"
  elif any(.[]; . == "📝 Docs") then "Docs"
  else empty end'
PRIORITY_JQ='
  if   any(.[]; startswith("0️⃣")) then "P0"
  elif any(.[]; startswith("1️⃣")) then "P1"
  elif any(.[]; startswith("2️⃣") or startswith("3️⃣")) then "P2"
  else empty end'

added=0
while IFS= read -r repo; do
  [[ -n $repo ]] || continue
  service=$(tr '[:upper:]' '[:lower:]' <<<"${repo#Expo-}")
  service=${service%-server}

  {
    gh issue list -R "$OWNER/$repo" --state open --limit 500 --json url,labels \
      --jq '.[] | {kind: "issue", url, labels: [.labels[].name]}'
    gh pr list -R "$OWNER/$repo" --state open --limit 500 --json url,labels \
      --jq '.[] | {kind: "pr", url, labels: [.labels[].name]}'
  } | jq -c --argjson existing "$EXISTING" 'select(.url as $u | $existing | index($u) | not)' |
  while IFS= read -r row; do
    url=$(jq -r .url <<<"$row")
    labels=$(jq -c .labels <<<"$row")
    item=$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" --format json --jq .id)

    if [[ $(jq -r .kind <<<"$row") == issue ]]; then status=계획됨; else status=리뷰중; fi
    set_option "$item" Status "$status"
    set_option "$item" Service "$service"
    kind=$(jq -r "$KIND_JQ" <<<"$labels")
    [[ -z $kind ]] || set_option "$item" Kind "$kind"
    priority=$(jq -r "$PRIORITY_JQ" <<<"$labels")
    [[ -z $priority ]] || set_option "$item" Priority "$priority"
    echo "added $url"
  done
done <<<"$REPOS"
