# load-test

폼 조회(`GET /forms/:expoId?type=STANDARD&applicationType=PRE`)와 공개 설문 조회(`GET /surveys/public/:expoId`)를
초당 요청 수 단계별로 재고, 단계마다 DB가 한 일(요청당 쿼리 수·돌려준 행 수·읽은 행 수)을 함께 남긴다.
필드를 jsonb로 옮긴 전후 결과는 [RESULTS.md](RESULTS.md)에 있다.

## 준비

1. `pg_stat_statements`를 켠 PostgreSQL 17

   ```bash
   docker run -d --name form-load-pg -e POSTGRES_USER=app -e POSTGRES_PASSWORD=<로컬 비밀번호> -e POSTGRES_DB=expoform \
     -p 5432:5432 postgres:17-alpine -c shared_preload_libraries=pg_stat_statements
   ```

2. 마이그레이션 후 시드. 시드는 옛 테이블(`dynamic_form`·`dynamic_survey`)에 넣으므로, `EmbedDynamicFields` 앞까지
   마이그레이션한 DB에 넣고 나서 나머지 마이그레이션을 실행한다(전환 마이그레이션이 시드를 옮긴다).

   ```bash
   docker exec -i form-load-pg psql -U app -d expoform < load-test/seed.sql
   ```

   박람회 200개, 박람회마다 필드 20개짜리 등록 폼 1개와 문항 20개짜리 설문 1개. 측정 대상은
   `11111111-1111-4111-8111-111111111111`이다.

3. 앱 빌드·기동(`pnpm build && node dist/main`, 기본 포트 3100). Kafka 토픽과 환경 변수는 `.env.example`을 따른다.

## 실행

```bash
load-test/run.sh <이름>          # 예) load-test/run.sh to-be
```

- JMeter의 `Precise Throughput Timer`로 도착률을 고정한다. 단계는 `RATES`(기본 `50 100 150 200 250 300 400`),
  단계 길이는 `DURATION`(초, 기본 30), 대상은 `TARGETS`(기본 `form survey`)로 바꾼다.
- 결과: `load-test/out/<이름>.tsv`(단계마다 한 줄), JTL 원본은 `load-test/out/<이름>/`. `out/`은 커밋하지 않는다.
