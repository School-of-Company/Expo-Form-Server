# 설문 답변 아웃박스 릴레이 부하 측정 (#136)

릴레이가 Kafka 발행 중에 DB 연결과 행 잠금을 쥐던 구조를 claim 방식으로 바꾼 PR #266의 전/후를 같은 조건에서 비교하는 하네스다. 결과와 해석은 [RESULTS.md](./RESULTS.md).

## 구성

| 파일 | 하는 일 |
|---|---|
| `docker-compose.yml` | 격리된 Postgres(55432)와 Kafka(59092). 개발용 compose와 포트·프로젝트 이름이 달라 겹치지 않는다 |
| `prepare.sh` | Before/After 두 시점의 코드를 `git archive`로 추출해 빌드한다 |
| `run.mjs` | 앱을 띄우고 시드·장애 주입·프로브·집계를 한 번 실행한다 |
| `matrix.sh` | 두 변형을 번갈아 3회씩 돌린다 |

## 준비

Docker, Node 26, pnpm 11이 필요하다. 의존성이 두 시점에서 같아야 하므로 `pnpm-lock.yaml`이 다르면 `prepare.sh`가 멈춘다.

```bash
cd load-test/outbox-relay
export WORK=/tmp/outbox-relay-loadtest   # 빌드·로그·결과가 쌓이는 곳(기본값)
./prepare.sh                             # BEFORE_REF=6897028^1, AFTER_REF=6897028
docker compose up -d                     # 끝나면 docker compose down -v
```

## 실행

```bash
# 한 번만
node run.mjs <before|after> <fault|drain> r1 "$WORK/out/result.json"

# 전체(시나리오 2 × 변형 2 × 3회). 끝나면 $WORK/out/*.json
./matrix.sh
```

| 시나리오 | 하는 일 |
|---|---|
| `fault` | Kafka 컨테이너를 `docker pause`로 15초 멈춘 채 접수 500건을 시드하고, 결과 반영(`markFinal`의 첫 문장과 같은 조건부 UPDATE)이 얼마나 기다리는지 잰다 |
| `drain` | 브로커가 정상일 때 접수 3,000건이 전부 Kafka에 전달되기까지의 시간 |

- 프로브는 응답을 기다리지 않고 250ms 간격으로 쏜다(open-loop). 막힌 동안 요청 수가 줄어 문제가 가려지는 coordinated omission을 피하려는 것이다.
- 전달 시각은 하네스가 별도 컨슈머로 기록한다. 앱의 상태 컬럼이 아니라 Kafka에 실제로 도착한 시각이다.
- 릴레이 설정은 두 변형이 같다: 주기 1초, 주기당 최대 500건, 발행 묶음 50건.

## 다른 코드를 비교하려면

`BEFORE_REF`·`AFTER_REF`에 커밋을 주면 된다. 릴레이 설정 환경변수(`SURVEY_ANSWER_RELAY_*`)가 없는 더 오래된 시점은 `run.mjs`의 `env`를 맞춰야 한다.

## 알아 둘 것

- 한 머신에서 앱·DB·Kafka·하네스를 모두 돌리므로 절대값은 환경에 따라 다르다. 변형 사이의 차이를 본다.
- `docker pause`는 연결을 유지한 채 브로커 응답만 멈춘다. 연결 거부와는 다른 장애다.
- 드물게 정지 해제 뒤에도 kafkajs 프로듀서 요청이 수 분 걸리는 경우가 있었다(RESULTS.md의 이상치).
