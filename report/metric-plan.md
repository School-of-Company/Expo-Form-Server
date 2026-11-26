# public-answers 성능 지표 PR 댓글 계획서

- 작성일: 2026-11-25
- 기준 커밋: `origin/develop` a43bbfd. 파일 인용은 이 커밋 기준입니다.
- 대상: `GET /internal/surveys/:expoId/public-answers` 하나. program-forms 목록은 제외합니다.
- 범위: C단계(측정 설계)부터입니다. 이 세션에는 A·B단계 기록이 없어서, 대상 선정 근거는 다시 적지 않았습니다.
- 제약: 이 파일 하나만 썼습니다. src·test·CI·설정은 고치지 않았고, 커밋과 PR도 만들지 않았습니다.

표기:

- **[확인]**: 파일을 직접 읽었거나 명령을 실행해 확인한 사실
- **[미확인]**: 추정이거나, 구현할 때 확인해야 하는 것

## 0. 최종 모습과 전제

PR마다 댓글 하나가 달리고, 푸시할 때마다 같은 댓글이 갱신됩니다. 사람 리뷰어와 리뷰 에이전트가 같은 댓글에서 같은 숫자를 봅니다.

| 지표 | Baseline | This PR | Impact | 상한 | 통과 여부 |
| ---- | -------- | ------- | ------ | ---- | --------- |

상한을 넘으면 ❌가 뜨고 체크 `perf-budget`이 실패합니다.

전제 두 가지가 계획 전체를 좌우합니다.

1. **Baseline은 PR의 base 커밋입니다.** 요청하신 표 머리글은 "Baseline(main)"이었습니다. 하지만 이 리포의 PR은 대부분 develop으로 갑니다(`ci.yml:5`). main과 비교하면 이미 develop에 들어간 남의 변화가 이 PR의 Impact로 찍힙니다. 그래서 머리글은 `Baseline(develop@abc1234)`처럼 비교한 sha를 보여 줍니다. 이 검증은 develop을 base로 하는 PR과 develop push에서만 돕니다. main으로 가는 PR(릴리즈)은 대상이 아닙니다.
2. **보고 워크플로우는 main에 먼저 들어가야 합니다.** `workflow_run`은 기본 브랜치(main)에 있는 워크플로우 파일로만 실행됩니다. 리포 기본 브랜치는 main입니다. **[확인]** 이 동작은 GitHub 문서 기준 지식입니다. **[미확인]** 그래서 판정 로직은 "base 브랜치 코드"가 아니라 "main에 있는 코드"입니다. 도입 순서는 11장에 적었습니다.

## 1. 대상 엔드포인트의 동작 [확인]

1. 컨트롤러가 `surveyPublicService.findAnswerPage(expoId, dto)`를 부릅니다(`src/survey/internal-survey.controller.ts:75-81`). 가드는 `InternalTokenGuard`입니다(`:36`).
2. 서비스는 다음 순서로 동작합니다(`src/survey/survey-public.service.ts:90-135`).
   - `findPublicSurvey`가 설문을 문항 jsonb까지 통째로 읽습니다(`findByExpoAndType`, `survey.store.ts:87-94`).
   - 커서가 있으면 그다음에 `decodeCursor`로 풉니다(`:95-96`). 그래서 잘못된 커서 요청도 DB 조회를 1번 씁니다.
   - 첫 페이지면 `answerStore.snapshot()`이 트랜잭션 안에서 `SELECT id FROM survey ... FOR SHARE`와 `SELECT to_char(clock_timestamp() ...)`를 실행합니다(`survey-public-answer.store.ts:123-139`).
   - `findPage`가 `LIMIT limit+1`로 행을 읽습니다(`:147-171`). 커서에 `totalCount`가 없으면(첫 페이지, 또는 옛 커서) `countUntil`로 다시 셉니다(`:169`, `:174-183`).
   - 응답의 `questions`는 페이지마다 문항 전체를 다시 싣습니다(`survey-public.service.ts:112-120`).
3. 커서는 서명 없는 base64url JSON입니다. 필드는 `surveyId`, `snapshotAt`, `createdAt`, `id`, `totalCount`입니다(`src/survey/public-answer-cursor.ts:12-30`).
4. 요청은 `limit` 1~1000, 기본 500입니다(`dto/find-public-survey-answers.request.dto.ts:8-11`).
5. 응답 필드는 `survey`, `questionDefinition`, `questions`, `snapshotAt`, `totalCount`, `answers[]`(`id`, `createdAt`, `occupation`, `answers`), `nextCursor`입니다(`dto/public-survey-answer-page.response.dto.ts:19-49`).
6. `src/main.ts`에는 전역 인터셉터와 압축이 없습니다. **[확인]**

예상 쿼리 수는 첫 페이지 7개, 다음 페이지 2개입니다.

- 첫 페이지: 설문 조회 1, 스냅샷 트랜잭션 4(`START TRANSACTION`, FOR SHARE, clock, `COMMIT`), 페이지 1, count 1
- 다음 페이지: 설문 조회 1, 페이지 1
- `START TRANSACTION`과 `COMMIT`도 `query()`를 거쳐 `logQuery`로 들어오는 것을 코드로 확인했습니다(`node_modules/typeorm/driver/postgres/PostgresQueryRunner.js:131,154,191`). **[확인]**
- 다만 실제 요청으로 세어 본 값은 아닙니다. **[미확인]** 첫 측정에서 확정합니다.

## 2. 지표 정의

| 키                  | 의미                                                         | 판정                                                      |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `queries.firstPage` | 첫 페이지 요청 한 번의 SQL 수                                | 축 3개(N, 2N, 문항 10배)에서 모두 같아야 함 + 절댓값 상한 |
| `queries.nextPage`  | 두 번째 페이지 요청 한 번의 SQL 수                           | 같음                                                      |
| `bytes.firstPage`   | 고정 시드 첫 페이지 응답 본문 바이트                         | 절댓값 상한                                               |
| `bytes.nextPage`    | 고정 시드 두 번째 페이지 바이트                              | 절댓값 상한                                               |
| `bytes.total`       | 고정 시드를 `nextCursor`가 null일 때까지 받은 바이트 합      | 절댓값 상한                                               |
| `bytes.perRow`      | `answers` 배열만의 바이트 합 ÷ N                             | 절댓값 상한(여유 10%)                                     |
| `sql`               | 첫·다음 페이지에서 실행된 SQL 목록(공백 정리, 파라미터 제외) | 판정하지 않음. 기준선과 다르면 댓글에 diff 표시           |

### 쿼리 수: "응답 수와 무관한가"를 먼저 봅니다

같은 요청을 세 가지 시드로 재고, 값이 모두 같아야 통과합니다.

- **N=250과 2N=500:** 행마다 조회하는 N+1 쿼리가 생기면 두 값이 달라집니다.
- **문항 3개와 30개(Q축):** 문항마다 조회하는 회귀를 잡습니다. 문항 수가 고정이면 이런 회귀는 N과 2N에서 똑같이 보여 놓칩니다(검토 지적 B4).

절댓값 상한은 "응답 수와 상관없이 쿼리가 하나 늘어난" 회귀를 잡는 보조 장치입니다. 예를 들어 설문을 두 번 조회하는 경우입니다.

`sql` 목록은 쿼리 수가 같아도 내용이 바뀐 경우를 사람이 보게 합니다. 예를 들어 다음 페이지에 count가 다시 생기면서 다른 쿼리가 하나 빠진 경우입니다.

### 바이트: 고정 시드 기준 절댓값 상한

- 바이트는 원래 N에 비례하므로 "N 무관"으로 검사할 수 없습니다.
- `bytes.perRow`를 따로 둡니다. 행마다 작은 필드(예: uuid 하나)가 붙으면 페이지 바이트로는 +10% 정도라 25% 여유 안에 묻히기 때문입니다(검토 지적 B5).
- 바이트는 HTTP 응답 본문을 `Buffer.byteLength(res.text, 'utf8')`로 셉니다. `res.text.length`는 UTF-16 글자 수라 한글이 있으면 바이트와 다릅니다(검토 지적 A10).

### 재지 않는 것

- **응답 시간:** CI 러너마다 편차가 커서 ❌가 흔들립니다.
- **쿼리 실행 계획:** 250~500행에서는 Postgres가 인덱스가 있어도 순차 스캔을 고를 수 있어 결과를 믿기 어렵습니다(10장 기각 참고).

### 고정 시드

- 설문 A(측정 대상)
  - 문항 구성은 기존 통합 테스트의 합성 설문과 같습니다(`survey-public-answer-page.integration-spec.ts:107-140`). 문장형, 체크박스(선택), 드롭다운(선택) 3개입니다. Q축용으로는 같은 패턴을 10번 반복한 30개짜리를 씁니다.
  - `survey.id`와 `expo_id`는 고정 UUID 상수입니다.
- 설문 B(소음): 다른 박람회 설문에 응답 1,000행을 넣습니다. `survey_id` 조건이 빠지는 회귀가 생기면 `totalCount`와 바이트가 크게 달라져 바로 걸립니다(검토 지적 B6의 일부).
- 응답 행은 HTTP 제출이 아니라 직접 INSERT합니다.
  - `id`는 인덱스로 만든 결정적 UUID입니다(예: `00000000-0000-4000-8000-{i:012d}`).
  - `created_at`은 `'2020-01-01T00:00:00Z' + i초`처럼 과거의 UTC 명시 값입니다. 미래 시각이면 조회 상한(`created_at <= snapshotAt`, `survey-public-answer.store.ts:156`) 밖으로 빠집니다(검토 지적 A11).
  - `answers`와 `occupation`은 i로 정해지는 고정 패턴이고, 값은 ASCII만 써서 바이트 길이를 고정합니다.
  - HTTP 제출을 쓰지 않는 이유: 제출은 `created_at`을 `clock_timestamp()`로 정하고(`survey-public-answer.store.ts:82`), 경품·기념품 행까지 만들어 바이트와 정렬을 흔듭니다.
- `limit=100`으로 고정합니다. N=250이면 3페이지, 2N=500이면 5페이지입니다.

## 3. 측정 결과 JSON

### 스키마(v1)

```json
{
  "schemaVersion": 1,
  "metricSet": "public-answers",
  "endpoint": "GET /internal/surveys/:expoId/public-answers",
  "source": {
    "sha": "<40 hex>",
    "baseSha": "<40 hex>",
    "event": "pull_request",
    "runId": 123,
    "runAttempt": 1
  },
  "env": { "postgres": "17.6", "node": "26.x" },
  "seed": { "n": 250, "limit": 100, "questions": [3, 30], "noiseRows": 1000 },
  "metrics": {
    "queries.firstPage": { "n": 7, "2n": 7, "q30": 7 },
    "queries.nextPage": { "n": 2, "2n": 2, "q30": 2 },
    "bytes.firstPage": 41234,
    "bytes.nextPage": 40987,
    "bytes.total": 102345,
    "bytes.perRow": 312
  },
  "sql": {
    "firstPage": ["SELECT ... FROM \"survey\" ..."],
    "nextPage": ["..."]
  },
  "stable": true
}
```

- `stable`: 같은 실행 안에서 측정을 두 번 해 모든 값이 같으면 true입니다(6장).
- `source`와 `env`는 표시용입니다. PR 번호, sha, 기준선 선택에는 GitHub API 값을 씁니다(4.3).

### 저장 위치

- 측정 잡이 러너의 `$RUNNER_TEMP/perf-metrics/public-answers.json`에 씁니다. 리포 안에는 쓰지 않습니다.
- 아티팩트 이름은 `perf-metrics`이고, 이 파일 하나만 담습니다. 보존 기간은 PR 실행 14일, 기준선(push) 실행 90일입니다.
- 상한 파일은 리포의 `perf/limits.json`에 둡니다(7장).

## 4. 워크플로우 구조

### 4.1 측정 워크플로우 `perf-metrics.yml` (신규, PR 코드로 실행)

```yaml
on:
  pull_request:
    branches: [develop]
  push:
    branches: [develop] # 기준선
  merge_group:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: perf-metrics-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  measure:
    runs-on: ubuntu-latest
    services:
      postgres: postgres:17-alpine@sha256:<고정> # 다이제스트로 고정
    steps:
      - checkout → pnpm install
      - DATABASE_URL=... pnpm exec vitest run --config ./vitest.config.metrics.ts # 측정 spec 하나만
      - upload-artifact: name=perf-metrics, path=$RUNNER_TEMP/perf-metrics/public-answers.json
```

- push(기준선) 실행은 sha별 그룹이라 서로 취소하지 않습니다. 머지가 연달아 들어와도 커밋마다 기준선이 남습니다(검토 지적 A3).
- 이 잡은 숫자를 만들기만 하고 통과/실패를 판정하지 않습니다. 측정 자체가 실패할 때만(서버 오류, 시드 실패, 200이 아닌 응답) 빨간불이 됩니다.
- 측정 spec은 운영과 같은 컨트롤러·서비스·스토어를 Nest 테스트 모듈로 띄우고, 전역 파이프와 필터도 운영과 같게 붙입니다. 기존 spec(`survey-public-answer-page.integration-spec.ts:80-96`)과 같은 방식입니다.

### 4.2 보고 워크플로우 `perf-report.yml` (신규, `workflow_run`, main에 있어야 실행됨)

```yaml
on:
  workflow_run:
    workflows: [perf-metrics]
    types: [completed]
permissions:
  actions: read # 다른 실행의 아티팩트 내려받기
  pull-requests: write # 댓글 작성·수정
  statuses: write # perf-budget 커밋 상태
  contents: read # perf/limits.json 읽기
concurrency:
  group: perf-report-${{ github.event.workflow_run.head_repository.full_name }}-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: false
```

절차:

1. `workflow_run.event`가 `pull_request`나 `merge_group`일 때만 보고합니다. `push`(기준선) 실행은 보고하지 않습니다.
2. 측정 실행의 아티팩트 `perf-metrics`를 `actions/download-artifact@v4`(`run-id`, `github-token`)로 내려받습니다.
3. **실행하지 않고 크기와 스키마만 검증합니다.**
   - zip 안에 `public-answers.json` 파일 하나만 있어야 합니다.
   - 파일 크기는 64KB 이하여야 합니다(`sql` 목록 포함).
   - `jq -e`로 스키마를 검사합니다: `schemaVersion==1`, `metricSet` 고정 문자열, 모든 지표가 0 이상 10^8 이하의 정수, `seed`가 main의 기대값과 같음.
   - 하나라도 어긋나면 ❌와 "측정 결과 형식 오류"를 남깁니다.
   - JSON의 문자열 값(`sql` 포함)은 셸 명령에 끼워 넣지 않고, 환경 변수와 `jq --arg`로만 다룹니다. 댓글에 넣을 때는 코드 블록 안에 넣고 백틱을 이스케이프합니다.
4. 기준선은 PR의 base sha와 같은 커밋을 측정한 push 실행에서 가져옵니다(4.6).
5. 상한은 base 브랜치와 PR head의 `perf/limits.json`을 둘 다 읽습니다(7장).
6. 판정 결과로 커밋 상태 `perf-budget`을 남기고(4.4), PR 이벤트면 댓글을 만들거나 갱신합니다(4.3).

### 4.3 같은 댓글을 찾아 갱신하기

- 댓글 본문 첫 줄에 숨은 마커를 둡니다: `<!-- perf-metrics:public-answers -->`
- 둘째 줄에는 메타 정보를 둡니다: `<!-- perf-meta sha=<head_sha> run=<run_id> attempt=<n> base=<base_sha> -->`
- PR 번호는 아티팩트 대신 `workflow_run.pull_requests[0].number`에서 얻습니다. 비어 있으면 `GET /repos/{owner}/{repo}/commits/{head_sha}/pulls`로 찾습니다.
- `GET /repos/.../issues/{pr}/comments --paginate`로 훑어, 작성자가 `github-actions[bot]`이고 첫 줄이 마커인 댓글을 찾습니다. 있으면 `PATCH`, 없으면 `POST`합니다.
- **merge_group 실행에서는 댓글을 쓰지 않고 커밋 상태만 남깁니다.** 대기열의 임시 커밋에는 `pull_requests`가 비어 있어 PR 찾기가 실패할 수 있기 때문입니다(검토 지적 A7). PR 번호가 필요하면 `ci.yml:272`처럼 ref의 `pr-([0-9]+)`에서 꺼냅니다.

### 4.4 오래된 실행이 최신 결과를 덮지 않게

댓글과 커밋 상태 둘 다 같은 규칙을 따릅니다(검토 지적 A6).

1. 보고 직전에 `GET /pulls/{pr}`로 PR의 현재 `head.sha`를 읽습니다. `workflow_run.head_sha`와 다르면 낡은 결과라 댓글을 건드리지 않습니다.
2. 같은 sha의 재실행끼리는, 이미 남은 댓글 메타와 커밋 상태 description의 `run`/`attempt`를 **숫자로** 비교해 작으면 건너뜁니다.
3. 커밋 상태 description 끝에 `run=<id>.<attempt>`를 넣어 2의 비교에 씁니다.
4. `concurrency` 그룹을 저장소+브랜치 단위로 두고 취소하지 않습니다. 포크의 같은 브랜치 이름과 섞이지 않게 저장소 이름을 함께 넣었습니다(검토 지적 A5, B11). 순서 보장은 1~3의 비교가 최종 방어선입니다.

### 4.5 필수 체크 연결

- 진짜 관문은 **병합 대기열(merge_group) 실행**입니다. PR 쪽 측정은 `refs/pull/N/merge`로 하는데 상태는 `head_sha`에 붙습니다. 그래서 base가 바뀌어도 head가 그대로면 옛 판정이 남습니다(검토 지적 A2). 대기열은 머지 직전 코드를 다시 재므로 이 문제가 없습니다.
- develop 규칙(`protect-develop`)의 필수 체크에 `perf-budget`을 추가합니다. PR 쪽 상태도 같은 이름으로 남아 리뷰 시점에 보이고, 대기열에서 다시 판정됩니다.
- **[미확인]** merge_group 실행이 `workflow_run`을 일으키는지, 커밋 상태를 대기열이 필수 체크로 인정하는지는 도입 때 확인해야 합니다. 안 되면 측정 워크플로우 안에서 merge_group일 때만 판정하는 잡을 따로 둡니다(main 코드로 판정하는 성질은 잃음).

### 4.6 기준선 고르기

- PR의 `pull_request.base.sha`를 API로 읽고, `head_sha`가 그 sha인 `perf-metrics` push 실행을 찾습니다(`gh run list --workflow perf-metrics.yml --commit <base_sha> --event push --status success`).
- 아티팩트를 내려받기 전에 `GET /actions/runs/{id}/artifacts`로 `expired`를 확인합니다(검토 지적 A4).
- 같은 sha 실행이 없거나 만료됐으면 develop의 가장 최근 성공 push 실행으로 대신하고, 머리글에 `Baseline(develop@<그 sha>, base와 다름)`이라고 표시합니다. 그것도 없으면 Baseline·Impact를 `—`로 둡니다.
- 기준선 쪽 실패는 판정에 넣지 않습니다. ❌는 PR 아티팩트 쪽 문제와 상한 초과에만 띄웁니다.

## 5. 실행 조건: 별도 잡 vs 기존 integration 잡

현재 CI의 조건입니다. **[확인]** `.github/workflows/ci.yml`:

```yaml
3  on:
4    pull_request:
5      branches: [develop, main]
7    merge_group:
10 concurrency:
11   group: ci-${{ github.event.pull_request.number || github.ref }}
102  integration:
103    needs: scope
135        if: needs.scope.outputs.tests == 'changed'      # 영향 범위 요약 단계
144          if [[ "$TESTS" == "changed" ]]; then
145            pnpm run test:integration --changed "origin/$BASE_REF" --passWithNoTests
146          else
147            pnpm run test:integration
```

- PR의 integration은 `scope`가 `changed`로 정하면 바뀐 파일과 관련된 통합 테스트만 돕니다(`:39`, `:144-147`).
- `ci.yml`에는 `push` 트리거가 없습니다(`:3-7`). 그래서 기준선을 만들 실행이 없습니다.

| 기준                  | 별도 워크플로우 `perf-metrics.yml` (추천)    | 기존 integration 잡에 단계 추가                                 |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| 모든 PR에서 항상 실행 | 조건 없이 실행                               | `--changed` 분기와 별개로 무조건 도는 단계가 필요함             |
| 기준선(push) 실행     | 자기 `on: push`로 해결                       | `ci.yml`에 `push`를 더해야 하고, 그러면 모든 잡이 push에서도 돎 |
| `workflow_run` 대상   | 측정만 담긴 실행이라 아티팩트가 명확함       | CI 전체 완료를 기다리고, 다른 잡 실패에 보고가 휘말림           |
| 병렬 간섭             | 측정 spec 하나만 단독 실행                   | 다른 통합 spec과 같은 프로세스에서 병렬로 돎                    |
| 필수 체크 영향        | 측정 실패가 integration 체크와 섞이지 않음   | 측정 실패가 integration을 빨갛게 만듦                           |
| 비용                  | Postgres와 설치를 한 번 더 함(약 40초, 병렬) | 추가 비용 거의 없음                                             |

추천은 **별도 워크플로우**입니다. 기준선 push 트리거와 `workflow_run`의 대상이 명확해지는 것이 결정적인 이유입니다. 추가 비용은 다른 잡과 병렬로 돌아 전체 시간에 거의 더해지지 않습니다.

## 6. 값이 흔들릴 수 있는 곳과 대책

| 원인                  | 영향                                            | 대책                                                                                                                                 |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `snapshotAt`(DB 시계) | 값은 매번 다름                                  | 형식이 마이크로초 고정 길이라 바이트는 같음(`public-answer-cursor.ts:8-10`, `survey-public-answer.store.ts:135`). 값은 비교하지 않음 |
| `nextCursor`          | base64 안에 시각·id·건수가 들어감               | 시드 id·시각이 고정 길이이고 N이 고정이라 길이가 같음                                                                                |
| UUID                  | 랜덤이면 값이 바뀜                              | 시드 id를 결정적으로 만듦. 길이는 원래 36자 고정                                                                                     |
| 같은 `created_at`     | 정렬이 `id`로 갈림                              | 시드 시각을 모두 다르게 함. 쿼리도 `ORDER BY created_at, id`(`survey-public-answer.store.ts:157`)                                    |
| 미래 시각 시드        | 상한 밖이라 행이 빠짐                           | 과거 UTC 명시 시각 사용                                                                                                              |
| jsonb 키 순서         | 응답 `answers` 객체 키 순서                     | Postgres jsonb가 키 순서를 정규화함 **[미확인: 실측]**                                                                               |
| 한글 등 멀티바이트    | 글자 수와 바이트가 다름                         | `Buffer.byteLength`로 세고 시드 값은 ASCII만 씀                                                                                      |
| 쿼리 측정 창          | 시드 INSERT, synchronize, 앞 요청의 꼬리가 섞임 | 요청 직전에 기록 배열을 비우고, 응답을 받은 직후 복사. 응답 200을 단언(오류면 `ROLLBACK`이 세어짐)                                   |
| 첫 연결               | 드라이버가 처음에 쿼리를 더 보낼 수 있음        | 측정 전에 같은 요청을 한 번 보내 데움. pg 연결 수립 자체는 `logQuery`로 오지 않음                                                    |
| 병렬 실행             | 다른 spec 쿼리가 섞임                           | 로거를 측정용 DataSource 하나에만 붙이고, 측정 spec만 단독 실행                                                                      |
| Postgres 버전         | 출력이 미세하게 바뀔 수 있음                    | 이미지를 다이제스트로 고정하고 JSON에 `server_version` 기록                                                                          |
| 문항 정의 변경        | `questions` 바이트                              | 시드가 고정함. 엔드포인트가 새 필드를 내기 시작하면 바이트가 느는 게 맞으므로 회귀 신호로 봄                                         |

마지막 확인으로, 한 실행 안에서 측정을 두 번 하고 하나라도 다르면 `stable:false`로 두고 ❌를 띄웁니다(원인: 측정 흔들림). 이 검사는 같은 실행 안의 흔들림만 잡습니다. 실행 사이의 차이는 이미지 고정과 기준선 비교로 막습니다.

## 7. 상한 정하는 방법

### 값

| 지표                                   | 상한                                  | 이유                                                                           |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `queries.*`                            | 첫 측정값 그대로(여유 0) + 세 축 일치 | 정수라 여유를 두면 쿼리 1개 증가를 놓침(7 × 1.25 = 8.75)                       |
| `bytes.firstPage`, `nextPage`, `total` | 첫 측정값 × 1.25를 1KB 단위로 올림    | 필드 하나 추가 같은 정상 변화는 통과시키고, 페이지가 크게 불어나는 변화는 잡음 |
| `bytes.perRow`                         | 첫 측정값 × 1.10을 올림               | 행마다 붙는 작은 필드를 잡음                                                   |

- 여유 25%는 요청하신 20~30% 범위의 가운데입니다. 시드가 고정이라 흔들림이 없으므로, 여유는 의도된 작은 변화를 위한 것입니다.
- 첫 측정값을 정할 때는 `sql` 목록을 사람이 한 번 읽고 확인합니다. 이미 회귀가 들어 있는 값이 그대로 굳는 것을 막기 위해서입니다(검토 지적 B9).
- 작은 증가가 PR마다 쌓여 상한까지 가는 것은 막지 못합니다. 대신 Impact 칸이 매번 증가율을 보여 줍니다.

### 파일과 리뷰

- 위치는 `perf/limits.json`입니다. `{ "public-answers": { "queries.firstPage": 7, ... } }` 모양입니다.
- 판정 규칙:
  - 판정은 PR head의 상한으로 합니다(상한 상향을 같은 PR에서 할 수 있게).
  - base와 다르면 그 행의 상한 칸에 `7 → 8 (변경)`처럼 표시하고, 댓글 상단에 경고를 띄웁니다.
- CODEOWNERS: `.github/CODEOWNERS`가 이미 있습니다(`* @cfcromn @jyx-07`). **[확인]** 하지만 두 규칙 모두 `require_code_owner_review`가 false라서 CODEOWNERS가 리뷰를 강제하지 않습니다. **[확인]**
- 그래서 **도입 조건**으로 둡니다.
  1. CODEOWNERS에 `/perf/`, 측정 spec 경로, `vitest.config.metrics.ts`, `/.github/workflows/`, `/.github/scripts/`를 지정 리뷰어로 적습니다.
  2. develop·main 규칙에서 `require_code_owner_review`를 켭니다.
  - 이 둘이 없으면 상한을 올리는 PR도, 측정 spec을 고쳐 숫자를 만드는 PR도 승인 1개로 통과합니다(검토 지적 B1, B2, A8).

## 8. 완성됐을 때 모습(스케치)

### 통과

```markdown
<!-- perf-metrics:public-answers -->
<!-- perf-meta sha=abc1234 run=456 attempt=1 base=def5678 -->

### public-answers 성능 지표 ✅

| 지표                                   | Baseline(develop@def5678) | This PR   | Impact | 상한                 | 통과 여부 |
| -------------------------------------- | ------------------------- | --------- | ------ | -------------------- | --------- |
| 첫 페이지 쿼리 수 (N / 2N / 문항×10)   | 7 / 7 / 7                 | 7 / 7 / 7 | 0      | 7, 응답·문항 수 무관 | ✅        |
| 다음 페이지 쿼리 수 (N / 2N / 문항×10) | 2 / 2 / 2                 | 2 / 2 / 2 | 0      | 2, 응답·문항 수 무관 | ✅        |
| 첫 페이지 바이트                       | 41.2 KB                   | 41.4 KB   | +0.5%  | 52 KB                | ✅        |
| 다음 페이지 바이트                     | 41.0 KB                   | 41.2 KB   | +0.5%  | 52 KB                | ✅        |
| 전체 바이트 (N=250)                    | 102.3 KB                  | 102.8 KB  | +0.5%  | 128 KB               | ✅        |
| 행당 바이트                            | 312 B                     | 314 B     | +0.6%  | 344 B                | ✅        |

SQL 목록: 기준선과 같음 · 시드 N=250, 2N=500, limit=100, 문항 3/30 · Postgres 17.6
```

### 실패

| 지표                                 | Baseline(develop@def5678) | This PR         | Impact             | 상한                 | 통과 여부                |
| ------------------------------------ | ------------------------- | --------------- | ------------------ | -------------------- | ------------------------ |
| 첫 페이지 쿼리 수 (N / 2N / 문항×10) | 7 / 7 / 7                 | 107 / 207 / 107 | +100 / +200 / +100 | 7, 응답·문항 수 무관 | ❌ 응답 수에 따라 늘어남 |
| 행당 바이트                          | 312 B                     | 352 B           | +12.8%             | 344 B                | ❌ 상한 초과             |

```diff
SQL 목록(첫 페이지) 기준선 대비
+ SELECT ... FROM "survey_gift_claim" WHERE "answer_id" = $1   (×100)
```

커밋 상태 `perf-budget`의 실패 메시지(140자 제한 **[미확인]**):

```
❌ 쿼리 수가 응답 수에 따라 늘어남(7→107/207), 행당 바이트 352B > 344B · run=456.1
```

### 그 밖의 상태

| 상황                            | 댓글                               | 체크                                |
| ------------------------------- | ---------------------------------- | ----------------------------------- |
| 기준선이 base sha와 다름        | 머리글에 `(base와 다름)`           | 상한으로만 판정                     |
| 기준선 없음·만료                | Baseline·Impact를 `—`              | 상한으로만 판정                     |
| PR 아티팩트 형식 오류·크기 초과 | "측정 결과 형식 오류" 한 줄        | ❌                                  |
| 측정 잡 실패                    | "측정 실패, 실행 링크"             | ❌                                  |
| `stable:false`                  | "같은 실행에서 값이 달라짐"        | ❌                                  |
| 상한 파일 변경                  | 상한 칸에 `옛값 → 새값`, 상단 경고 | 새 값으로 판정(코드 오너 승인 필요) |
| merge_group 실행                | 댓글 없음                          | 대기열 커밋에 상태만                |

## 9. 계획서 검토 (독립 서브에이전트 2개)

초안을 서로 독립된 서브에이전트 2개에게 주었습니다. 각각 같은 코드에서 결과가 흔들리는 경우(A)와 회귀를 못 잡거나 우회되는 경우(B)를 찾게 했습니다. 둘 다 계획서와 인용된 코드를 직접 읽었습니다. 한쪽(A)은 `PostgresQueryRunner.js`와 `main.ts`까지 읽었고, 그 주장은 제가 다시 확인했습니다.

### 반영한 지적

| #           | 지적                                                                    | 반영 위치                                                             |
| ----------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A1, B3      | `workflow_run`은 main의 파일로만 돌아, main에 없으면 체크가 영원히 대기 | 0장 전제 2, 11장 도입 순서                                            |
| A2          | PR 쪽 상태가 base 변경 뒤에도 낡은 채 남음                              | 4.5: 병합 대기열을 진짜 관문으로                                      |
| A3          | 기준선이 PR의 base가 아니고, push 실행이 서로 취소됨                    | 4.1 push 그룹을 sha별로, 4.6 base sha로 기준선 선택                   |
| A4          | 기준선 아티팩트 만료가 형식 오류 ❌로 처리됨                            | 4.6 `expired` 확인, 기준선 실패는 판정 제외                           |
| A5, B11     | concurrency 그룹 `head_branch`가 포크·다른 PR과 섞임                    | 4.2·4.4 저장소 이름 포함                                              |
| A6          | 재실행에서 커밋 상태가 최신을 덮음, 문자열 비교                         | 4.4 상태도 숫자 비교, description에 run 기록                          |
| A7          | merge_group 실행에서 PR 찾기가 실패해 보고가 죽음                       | 4.3 merge_group은 상태만                                              |
| A8, B2      | 같은 PR에서 상한을 올리면 통과                                          | 7장 코드 오너 리뷰 강제를 도입 조건으로                               |
| A9          | 쿼리 측정 창에 시드·앞 요청이 섞임                                      | 6장 요청 직전 비우기, 200 단언                                        |
| A10         | 바이트를 UTF-16 길이로 셀 위험                                          | 2장·6장 `Buffer.byteLength`, ASCII 시드                               |
| A11         | 미래 시각 시드는 조회 상한 밖으로 빠짐                                  | 2장 과거 UTC 시각                                                     |
| A12         | 실행 사이 차이(이미지 버전)                                             | 4.1 다이제스트 고정, `env.postgres` 기록                              |
| B1          | PR 코드가 숫자를 직접 만들어 조작 가능                                  | 7장 측정 spec 경로를 코드 오너 리뷰로 묶음(부분 반영, 아래 기각 참고) |
| B4          | 문항 수에 비례하는 회귀를 놓침                                          | 2장 Q축(3 vs 30)                                                      |
| B5          | 행마다 붙는 작은 필드가 25% 여유에 묻힘                                 | 2장 `bytes.perRow`, 여유 10%                                          |
| B6 일부     | `survey_id` 필터가 빠지는 회귀가 안 보임                                | 2장 소음 설문 1,000행                                                 |
| B7 일부, B9 | 다음 페이지에 count가 생기는 등 내용 변화, 첫 값이 회귀를 굳힘          | 2장 `sql` 목록과 diff, 7장 첫 값 사람 확인                            |
| B10 일부    | 다른 워크플로우가 같은 이름의 상태를 위조할 수 있음                     | 7장 `.github/workflows/`를 코드 오너 대상에 포함                      |

### 기각한 지적

| #          | 지적                                                    | 기각 이유                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 나머지  | `workflow_run` 쪽에서 base의 spec으로 PR의 `src`를 측정 | PR 코드를 권한 있는 워크플로우에서 실행하게 됩니다. 요청하신 제약("PR 코드로 만든 아티팩트는 실행하지 않고 크기와 스키마만 검증")과 정면으로 부딪힙니다. 숫자 조작은 코드 오너 리뷰로 막습니다  |
| B3 나머지  | `workflow_run` 대신 같은 워크플로우 안에서 판정         | 포크 PR이 없는 지금은 단순하지만, 판정 로직을 PR이 고칠 수 있게 됩니다. 요청하신 구조를 유지하고, main 선반영 순서로 문제를 풉니다                                                              |
| B6 나머지  | `EXPLAIN`으로 인덱스 사용과 정렬 노드 단언              | 수백 행 시드에서는 Postgres가 인덱스가 있어도 순차 스캔을 고를 수 있어 오히려 흔들립니다. 실행 계획을 믿을 만큼 키우면 측정 시간이 늘어납니다. 이번 범위에서 빼고 확인하지 못한 것에 남깁니다   |
| B7 나머지  | 기본 limit 500으로 한 번 더 측정                        | 기본값 변경은 DTO diff로 리뷰에서 보입니다. limit에 비례하는 처리는 이미 limit 100의 바이트·쿼리로 드러납니다                                                                                   |
| B8         | 404·잘못된 커서 같은 오류 경로의 쿼리 수                | 이번 목표는 정상 경로의 비용 회귀입니다. 오류 경로는 동작 검증으로 이미 통합 테스트가 있습니다(`survey-public-answer-page.integration-spec.ts:259-295`, `:453`)                                 |
| B10 나머지 | check run과 ruleset의 "expected source"로 위조 차단     | 모든 워크플로우가 같은 GitHub Actions 앱 신원을 쓰므로 출처를 고정해도 PR이 추가한 워크플로우와 구분되지 않습니다. 워크플로우 파일 변경을 코드 오너 리뷰로 묶는 것이 실효적인 대책입니다        |
| B12        | 측정 spec이 `AppModule`을 그대로 띄워야 함              | `AppModule`은 Kafka 접속까지 필요해 측정이 무거워지고 흔들립니다. `main.ts`에 전역 인터셉터와 압축이 없어 운영과 달라지는 경로가 없음을 확인했습니다. 전역 파이프와 필터는 운영과 같게 붙입니다 |

## 10. 확인하지 못한 것

### 파일을 직접 읽거나 실행해 확인한 것 [확인]

- 엔드포인트 흐름과 쿼리 위치(1장의 인용)
- 응답·요청 스키마, 커서 형식
- `START TRANSACTION`·`COMMIT`이 `logQuery`로 들어옴(`PostgresQueryRunner.js:131,154,191`)
- `src/main.ts`에 전역 인터셉터와 압축이 없음
- `ci.yml`의 `on`/`concurrency`/integration 조건(5장 인용). `push` 트리거가 없음
- `.github/CODEOWNERS` 내용, 두 규칙의 `require_code_owner_review: false`
- 리포 기본 브랜치가 `main`, 워크플로우 기본 토큰 권한이 `write`(`gh api repos/{owner}/{repo}/actions/permissions/workflow`)
- 쿼리 수 세는 지점: TypeORM `Logger.logQuery`를 DataSource에 붙이는 방식이 실제 Postgres에서 동작함
  - 임시 Postgres 17 컨테이너에서 `src/form/program-form-update.integration-spec.ts`(이 방식으로 "쿼리 1개"를 단언하는 테스트 포함)와 `src/survey/survey-public-answer-page.integration-spec.ts` 전체를 실행해 14개 모두 통과
  - 컨테이너는 실행 후 삭제했고 출력물은 남기지 않음

### 확인하지 못한 것 [미확인]

- public-answers 첫 페이지와 다음 페이지의 실제 쿼리 수(7/2는 코드 기반 추정)
- 실제 바이트 값. 상한 숫자는 첫 측정 뒤에 정함
- `workflow_run`이 기본 브랜치의 파일로만 실행된다는 것(GitHub 문서 기준 지식, 이 리포에서 실측하지 않음)
- merge_group 실행이 `workflow_run`을 일으키는지, 커밋 상태를 병합 대기열이 필수 체크로 인정하는지
- artifact v4가 재실행(attempt)에서 이전 아티팩트를 어떻게 다루는지
- 포크 PR에서 `workflow_run.pull_requests`가 비는 경우(지금은 내부 브랜치 PR만 있음)
- 커밋 상태 description 길이 제한(140자로 알고 있음)
- jsonb 키 순서 정규화로 바이트가 같다는 것
- 쿼리 실행 계획 회귀(인덱스 미사용, 정렬 추가)는 이 설계로 잡지 못함

### 실행하지 않은 명령(미확인 명령어)

| 명령                                                                                                          | 용도                                  |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `pnpm exec vitest run --config ./vitest.config.metrics.ts`                                                    | 측정 spec 실행(설정 파일은 아직 없음) |
| `gh run list --workflow perf-metrics.yml --commit <base_sha> --event push --status success --json databaseId` | 기준선 실행 찾기                      |
| `gh api repos/{o}/{r}/actions/runs/{id}/artifacts --jq '.artifacts[] \| {name, expired}'`                     | 아티팩트 만료 확인                    |
| `gh run download <run-id> -n perf-metrics -D <dir>`                                                           | 아티팩트 내려받기                     |
| `gh api repos/{o}/{r}/commits/{sha}/pulls`                                                                    | PR 번호 찾기                          |
| `gh api repos/{o}/{r}/issues/{pr}/comments --paginate`                                                        | 마커 댓글 찾기                        |
| `gh api -X PATCH repos/{o}/{r}/issues/comments/{id} -f body=...`                                              | 댓글 갱신                             |
| `gh api -X POST repos/{o}/{r}/statuses/{sha} -f state=failure -f context=perf-budget -f description=...`      | 커밋 상태                             |
| `jq -e '<스키마 검사식>' public-answers.json`                                                                 | 아티팩트 검증                         |
| `docker pull postgres:17-alpine && docker inspect --format '{{index .RepoDigests 0}}' postgres:17-alpine`     | 이미지 다이제스트 고정                |

## 11. 도입 순서(제안)

1. 측정 spec, `vitest.config.metrics.ts`, `perf-metrics.yml`을 develop에 넣습니다. 이때는 판정 없이 아티팩트만 올립니다.
2. 첫 측정값과 `sql` 목록을 사람이 확인하고 `perf/limits.json`을 정합니다.
3. CODEOWNERS 경로를 추가하고, 두 규칙의 `require_code_owner_review`를 켭니다.
4. `perf-report.yml`을 main에 반영합니다(develop → main 릴리즈 또는 main 직접 PR). 이때부터 PR에 댓글이 뜹니다.
5. 몇 개 PR에서 댓글과 상태가 안정적인지 본 뒤, `protect-develop` 필수 체크에 `perf-budget`을 추가합니다. merge_group에서 상태가 남는지 먼저 확인합니다(4.5 [미확인]).
