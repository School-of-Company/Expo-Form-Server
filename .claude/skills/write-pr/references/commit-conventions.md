# Commit & PR Conventions

## Commit Message Format

`type(scope): description`

- **Type**: `feat` / `fix` / `refactor` / `docs` / `chore` / `test`
- **Scope**: `form` / `survey` / `json` (모듈 기준). 어느 모듈에도 속하지 않는 변경(설정, 툴링, 에이전트/스킬 문서)은 `global`
- **Description**: 한글, 명사형 종결, 마침표 없음
  - Good examples: `레포 선택 드롭다운 구현`, `PR 생성 시 base branch 조회 실패 처리`
- Subject line only (no body) — breaking change일 때만 예외적으로 본문에 `BREAKING CHANGE: <설명>` 추가

## PR Title Format

`[scope] description`

- Scope는 커밋의 scope와 동일한 어휘 사용, 소문자 대괄호로 표기: `[form]`, `[survey]`, `[json]`
- 여러 scope에 걸친 변경은 `[global]` 사용

## Version Bump Rule (releases to `main`)

A `develop` → `main` PR's title is not `[scope] description` but a bare `vX.Y.Z`. Decide which of
X/Y/Z to bump by looking at the commits going into `main` this time:

- **X (Major)** — an architecture change, or a large change to a major feature.
- **Y (Minor)** — a feature addition/change that changes the API spec. Backward compatibility is not
  guaranteed.
- **Z (Patch)** — a plain bug fix, refactor, or performance improvement with no API spec change.
  Backward compatibility must be guaranteed (bumping only Z must still work correctly).

Reset every field below the one you bump to 0 (e.g. bumping Minor resets Patch to 0). Bump
`package.json`'s `version` to match, committed in the same PR.
