# 성능 지표 결과 JSON 스키마 (schemaVersion 1)

이 문서는 성능 지표 측정 결과 파일의 형식을 정의합니다. 형식은 프로젝트와 무관합니다. 보고 쪽 코드(실행 요약, PR 댓글, 판정)는 지표 이름을 알지 않아도 이 파일만으로 표를 그리고 판정할 수 있어야 합니다.

- 결과 파일을 만드는 공통 헬퍼: `perf/metric-report.ts`. Node 표준 모듈에만 의존하므로 다른 프로젝트에 그대로 복사할 수 있습니다.
- 첫 사용처: `test/metrics/public-answers.metrics-spec.ts`. 엔드포인트, 시드, 지표 이름 같은 프로젝트 고유 값은 이 파일에만 둡니다.
- 관련 계획서: `report/metric-plan.md`

## 1. 파일 위치와 이름

- 측정 잡은 결과를 `$RUNNER_TEMP/perf-metrics/<metricSet>.json`에 씁니다. CI 밖에서는 OS 임시 폴더를 씁니다.
- 한 측정 잡이 여러 지표 묶음을 재면 묶음마다 파일을 하나씩 씁니다.
- 아티팩트 이름은 `perf-metrics`이고, 위 폴더의 `*.json`을 모두 담습니다.

## 2. 필드

| 필드                                | 타입                  | 필수 | 설명                                                                                         |
| ----------------------------------- | --------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `schemaVersion`                     | 정수                  | 예   | 항상 `1`. 형식을 바꾸면 올립니다. 보고 쪽은 모르는 버전을 형식 오류로 처리합니다             |
| `metricSet`                         | 문자열                | 예   | 지표 묶음 이름. 파일 이름, 상한 파일의 키, 댓글 마커에 씁니다. 영문 소문자·숫자·`-`만 씁니다 |
| `title`                             | 문자열                | 예   | 사람이 읽는 제목. 예: 측정한 엔드포인트                                                      |
| `source.sha`                        | 문자열 \| null        | 예   | 측정한 커밋. CI 밖이면 null                                                                  |
| `source.baseSha`                    | 문자열 \| null        | 예   | PR의 base 커밋. PR이 아니면 null                                                             |
| `source.event`                      | 문자열 \| null        | 예   | 실행을 일으킨 이벤트(`pull_request`, `push` 등)                                              |
| `source.runId`, `source.runAttempt` | 정수                  | 예   | CI 실행 번호와 재실행 횟수. CI 밖이면 0                                                      |
| `env`                               | 문자열 맵             | 예   | 런타임 버전 등. `node`는 헬퍼가 채웁니다. 표시만 합니다                                      |
| `params`                            | 문자열·숫자·불리언 맵 | 예   | 측정 조건(시드 크기 등). 표시만 합니다                                                       |
| `metrics`                           | 배열                  | 예   | 지표 목록(3장). 순서대로 표에 그립니다                                                       |
| `details`                           | 문자열 배열 맵        | 예   | 접어서 보여 줄 목록(실행된 SQL 등). 표시만 하고, 기준선과 다르면 diff로 보여 줄 수 있습니다  |
| `stable`                            | 불리언                | 예   | 같은 실행 안에서 두 번 잰 값이 모두 같았는지                                                 |

`source`는 표시용입니다. 보고 쪽은 PR 번호, sha, 기준선 선택에 이 값 대신 CI 플랫폼의 API 값을 씁니다. 결과 파일은 PR 코드가 만들기 때문입니다.

## 3. 지표(`metrics[]`)

| 필드      | 타입                 | 필수             | 설명                                                                                                                                            |
| --------- | -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | 문자열               | 예               | 묶음 안에서 고유한 키. 기준선 비교와 상한 파일 조회에 씁니다                                                                                    |
| `label`   | 문자열               | 예               | 표에 보일 이름                                                                                                                                  |
| `kind`    | `max` \| `invariant` | 예               | 판정 규칙(4장)                                                                                                                                  |
| `unit`    | 문자열               | 예               | 값의 단위. `count`, `bytes`, `ms`, `ratio` 중에서 고르기를 권합니다. 보고 쪽은 `bytes`를 KB로 바꿔 보여 줄 수 있고, 모르는 단위는 그대로 씁니다 |
| `value`   | 0 이상의 숫자        | 예               | 대표값. `invariant`면 첫 표본 값입니다                                                                                                          |
| `samples` | `{ label, value }[]` | `invariant`면 예 | 서로 다른 조건에서 잰 값. 2개 이상입니다                                                                                                        |

## 4. kind별 판정 규칙

상한은 결과 파일에 넣지 않습니다. 상한은 리포의 상한 파일(예: `perf/limits.json`, 키는 `metricSet` → `id`)에 두고, 리뷰를 거쳐 바꿉니다. 결과 파일은 PR 코드가 만들기 때문에, 상한까지 결과 파일에 두면 PR이 스스로 상한을 정하게 됩니다.

| kind        | 통과 조건                                                           | 상한이 없을 때                 | 실패 메시지 예                                      |
| ----------- | ------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `max`       | `value <= 상한`                                                     | 판정하지 않고 값만 보여 줍니다 | `전체 바이트 140.1KB > 128KB`                       |
| `invariant` | 모든 `samples[].value`가 같음. 상한이 있으면 `value <= 상한`도 만족 | 표본 일치만 판정합니다         | `첫 페이지 쿼리 수가 조건에 따라 달라짐(7/107/207)` |

모든 지표에 공통으로 적용하는 규칙:

- `stable`이 false면 지표와 상관없이 실패입니다. 같은 코드에서 값이 흔들리면 판정을 믿을 수 없기 때문입니다.
- 기준선(base 커밋의 결과 파일)에 같은 `id`와 `unit`의 지표가 있으면 Impact를 `This PR - Baseline`과 증가율로 보여 줍니다. Impact는 판정에 쓰지 않습니다.
- 기준선에 없는 `id`는 "새 지표", 결과 파일에서 사라진 `id`는 "사라진 지표"로 표시합니다.
- 결과 파일이 이 스키마를 지키지 않으면 실패입니다(형식 오류). 보고 쪽은 이 파일을 실행하지 않고 크기와 스키마만 검증합니다.

## 5. 예시

### 예시 1: HTTP 엔드포인트 (이 리포의 public-answers)

```json
{
  "schemaVersion": 1,
  "metricSet": "public-answers",
  "title": "GET /internal/surveys/:expoId/public-answers",
  "source": {
    "sha": "c017ae9...",
    "baseSha": "05e07ad...",
    "event": "pull_request",
    "runId": 45741826849,
    "runAttempt": 1
  },
  "env": { "node": "v26.13.1", "postgres": "17.11" },
  "params": { "n": 250, "limit": 100, "questions": "3/30", "noiseRows": 1000 },
  "metrics": [
    {
      "id": "queries.firstPage",
      "label": "첫 페이지 쿼리 수",
      "kind": "invariant",
      "unit": "count",
      "value": 7,
      "samples": [
        { "label": "N=250", "value": 7 },
        { "label": "2N=500", "value": 7 },
        { "label": "questions=30", "value": 7 }
      ]
    },
    {
      "id": "bytes.firstPage",
      "label": "첫 페이지 바이트",
      "kind": "max",
      "unit": "bytes",
      "value": 16746
    },
    {
      "id": "bytes.perRow",
      "label": "행당 바이트",
      "kind": "max",
      "unit": "bytes",
      "value": 159
    }
  ],
  "details": {
    "sql.firstPage": [
      "SELECT ... FROM \"survey\" ...",
      "START TRANSACTION",
      "..."
    ]
  },
  "stable": true
}
```

### 예시 2: 다른 스택의 프로젝트 (가상의 프론트엔드 빌드)

NestJS도 HTTP도 아닌 경우입니다. 같은 형식으로 번들 크기와 렌더링 횟수를 담습니다.

```json
{
  "schemaVersion": 1,
  "metricSet": "web-bundle",
  "title": "Next.js production build",
  "source": {
    "sha": null,
    "baseSha": null,
    "event": null,
    "runId": 0,
    "runAttempt": 0
  },
  "env": { "node": "v22.11.0", "next": "15.0.3" },
  "params": { "route": "/dashboard" },
  "metrics": [
    {
      "id": "bundle.firstLoadJs",
      "label": "첫 로드 JS",
      "kind": "max",
      "unit": "bytes",
      "value": 184320
    },
    {
      "id": "render.listItems",
      "label": "목록 렌더링 횟수",
      "kind": "invariant",
      "unit": "count",
      "value": 1,
      "samples": [
        { "label": "items=10", "value": 1 },
        { "label": "items=1000", "value": 1 }
      ]
    }
  ],
  "details": {},
  "stable": true
}
```

### 예시 3: 판정 결과 (상한 파일과 함께)

상한 파일 `perf/limits.json`:

```json
{ "public-answers": { "queries.firstPage": 7, "bytes.firstPage": 21504 } }
```

| 지표                                 | kind      | 값    | 상한  | 결과                  |
| ------------------------------------ | --------- | ----- | ----- | --------------------- |
| `queries.firstPage` (표본 7/7/7)     | invariant | 7     | 7     | 통과                  |
| `queries.firstPage` (표본 7/107/207) | invariant | 7     | 7     | 실패: 표본이 다름     |
| `bytes.firstPage`                    | max       | 16746 | 21504 | 통과                  |
| `bytes.perRow`                       | max       | 159   | 없음  | 판정 안 함(값만 표시) |

## 6. 확인하지 못한 것

- 이 스키마가 다른 프로젝트에 충분한지는 미확인입니다. 이 리포(NestJS, Postgres)의 지표 하나로만 시험했습니다. 예시 2는 형식 설명용 가상 사례이고, 실제 프로젝트에서 써 보지 않았습니다.
- 다음 경우는 지금 형식으로 표현할 수 없습니다: 상한이 아니라 하한이 필요한 지표(예: 처리량), 표본 사이에 허용 오차가 있는 `invariant`, 측정마다 값이 흔들리는 지표(시간)의 통계값.
