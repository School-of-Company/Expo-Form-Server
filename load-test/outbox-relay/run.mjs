// 설문 답변 아웃박스 릴레이(#136)의 claim 전/후를 같은 조건에서 비교하는 하네스.
// 사용: WORK=<prepare.sh가 만든 디렉터리> node run.mjs <before|after> <fault|drain> <runId> <outJson>
// 재현 절차와 해석은 README.md, 측정 결과는 RESULTS.md를 본다.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

// prepare.sh가 before/·after/ 빌드를 만든 작업 디렉터리. 로그는 여기 logs/에 쌓인다.
const E = path.resolve(process.env.WORK ?? '/tmp/outbox-relay-loadtest');
const [variant, scenario, runId, outPath] = process.argv.slice(2);
const appDir = path.join(E, variant);
const require = createRequire(path.join(E, 'after', 'package.json'));
const { Pool } = require('pg');
const { Kafka, logLevel } = require('kafkajs');

const DB = 'postgres://app:app@localhost:55432/expoform';
const BROKER = 'localhost:59092';
const KAFKA_CONTAINER = process.env.KAFKA_CONTAINER ?? 'load-test-outbox-kafka-1';
const submitTopic = `outbox-lt.submit.${runId}`;
const resultTopic = `outbox-lt.result.${runId}`;
const PORT = 3100 + Math.floor(Math.random() * 500);

// 시나리오 파라미터. 두 변형이 똑같이 받는다.
const CFG = {
  fault: { rows: 500, pauseMs: 15_000, probeTargets: 100 },
  drain: { rows: 3000, pauseMs: 0, probeTargets: 100 },
}[scenario];
const RELAY_BATCH = 500;
const RELAY_INTERVAL_MS = 1000;

const pool = new Pool({ connectionString: DB, max: 80, application_name: 'harness' });
const now = () => Number(process.hrtime.bigint() / 1_000n) / 1000; // ms
const sh = (...args) => execFileSync(args[0], args.slice(1), { encoding: 'utf8' });

// ---- Kafka: 토픽 준비 + 전달 시각 기록 컨슈머 ----
const kafka = new Kafka({ clientId: `outbox-lt-${runId}`, brokers: [BROKER], logLevel: logLevel.NOTHING, retry: { retries: 30 } });
const admin = kafka.admin();
await admin.connect();
await admin.createTopics({ topics: [{ topic: submitTopic }, { topic: resultTopic }], waitForLeaders: true });
await admin.disconnect();

const delivered = new Map(); // eventId -> ms(harness clock)
let firstDeliveredAt = null;
const consumer = kafka.consumer({ groupId: `outbox-lt-h-${runId}` });
await consumer.connect();
await consumer.subscribe({ topic: submitTopic, fromBeginning: true });
await consumer.run({
  eachMessage: async ({ message }) => {
    const t = now();
    const eventId = JSON.parse(message.value.toString()).eventId;
    if (!delivered.has(eventId)) delivered.set(eventId, t);
    firstDeliveredAt ??= t;
  },
});

// ---- DB 준비 ----
await pool.query('TRUNCATE survey_answer_submission').catch(() => {}); // 첫 실행은 앱의 synchronize가 테이블을 만든다

// ---- 앱 기동 ----
mkdirSync(path.join(E, 'logs'), { recursive: true });
mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
const logPath = path.join(E, 'logs', `${variant}-${scenario}-${runId}.log`);
writeFileSync(logPath, '');
const log = createWriteStream(logPath);
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PORT),
  DATABASE_URL: DB,
  KAFKA_BROKERS: BROKER,
  KAFKA_CLIENT_ID: `outbox-lt-app-${variant}-${runId}`,
  KAFKA_SURVEY_ANSWER_SUBMIT_TOPIC: submitTopic,
  KAFKA_SURVEY_ANSWER_RESULT_TOPIC: resultTopic,
  KAFKA_SURVEY_ANSWER_RESULT_GROUP_ID: `outbox-lt-app-${runId}`,
  USER_SERVICE_URL: 'http://127.0.0.1:59999',
  USER_SERVICE_INTERNAL_TOKEN: 'x'.repeat(40),
  SURVEY_ANSWER_RELAY_INTERVAL_MS: String(RELAY_INTERVAL_MS),
  SURVEY_ANSWER_RELAY_BATCH_SIZE: String(RELAY_BATCH),
  DISCORD_WEBHOOK_URL: '',
  INTERNAL_TOKEN: 'i'.repeat(40),
  EUREKA_SERVICE_URL: 'false', // ConditionalModule: 'false'면 Eureka 모듈을 불러오지 않는다
};
const app = spawn('node', ['dist/main'], { cwd: appDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
app.stdout.pipe(log);
app.stderr.pipe(log);
let appExited = false;
app.on('exit', () => { appExited = true; });

const started = Date.now();
while (!readFileSync(logPath, 'utf8').includes('successfully started')) {
  if (appExited || Date.now() - started > 90_000) throw new Error(`app did not start (see ${logPath})`);
  await sleep(300);
}
await sleep(1500); // 프로듀서 연결·컨슈머 그룹 조인 여유

// ---- 샘플러: pg_stat_activity ----
const samples = [];
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    const { rows } = await pool.query(`
      SELECT count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_tx,
             count(*) FILTER (WHERE state <> 'idle')::int AS non_idle,
             count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiters,
             coalesce(max(extract(epoch FROM now() - xact_start) * 1000) FILTER (WHERE state <> 'idle'), 0)::float8 AS max_xact_ms
        FROM pg_stat_activity
       WHERE datname = 'expoform' AND application_name <> 'harness' AND pid <> pg_backend_pid()`);
    samples.push({ t: now(), ...rows[0] });
    await sleep(200);
  }
})();

// ---- 시드 ----
async function seed(n) {
  const surveyId = randomUUID();
  const expoId = randomUUID();
  await pool.query(
    `INSERT INTO survey_answer_submission
       (survey_id, expo_id, participation_type, phone_number, event_id, status, retry_count, payload, created_at, updated_at)
     SELECT $1::uuid, $2::uuid, 'STANDARD', '010' || lpad(i::text, 8, '0'), gen_random_uuid(), 'RECEIVED', 0,
            jsonb_build_object('answers', jsonb_build_object('1', 'answer-' || i, '2', true), 'personalInformationStatus', true),
            clock_timestamp() + (i || ' microseconds')::interval, now()
       FROM generate_series(1, $3::int) AS i`,
    [surveyId, expoId, n],
  );
}

// ---- 프로브: markFinal의 첫 문장과 같은 조건부 UPDATE를 일정 간격(open-loop)으로 쏜다 ----
const probes = [];
let probeTargets = [];
const probesInFlight = [];
function fireProbe(i, eventId) {
  const t0 = now();
  const p = pool
    .query(`UPDATE survey_answer_submission SET status = 'STORED' WHERE event_id = $1 AND status IN ('RECEIVED','PUBLISHED')`, [eventId])
    .then((r) => probes.push({ i, firedAt: t0, ms: now() - t0, affected: r.rowCount }))
    .catch((e) => probes.push({ i, firedAt: t0, ms: now() - t0, error: String(e.message) }));
  probesInFlight.push(p);
}

const result = { variant, scenario, runId, cfg: { ...CFG, RELAY_BATCH, RELAY_INTERVAL_MS } };
const tStart = now();

if (scenario === 'fault') {
  sh('docker', 'pause', KAFKA_CONTAINER);
  result.pausedAt = now() - tStart;
}
await seed(CFG.rows);
const tSeeded = now();
result.seedAt = tSeeded - tStart;

// 프로브 대상: 가장 오래된(= 첫 릴레이 주기에 잡히는) 행들
const { rows: targets } = await pool.query(
  `SELECT event_id FROM survey_answer_submission ORDER BY created_at ASC LIMIT $1`, [CFG.probeTargets]);
probeTargets = targets.map((r) => r.event_id);

// 프로브 발사: 릴레이 첫 주기(≈1s) 이후부터 250ms 간격. fault에서는 pause 동안, drain에서는 20개만.
const probeStartDelay = 1500;
const probeWindowMs = scenario === 'fault' ? CFG.pauseMs - probeStartDelay - 500 : 5000;
const probeEveryMs = 250;
const probeLoop = (async () => {
  await sleep(probeStartDelay);
  const t0 = now();
  let i = 0;
  while (now() - t0 < probeWindowMs && i < probeTargets.length) {
    fireProbe(i, probeTargets[i]);
    i++;
    await sleep(probeEveryMs);
  }
})();

if (scenario === 'fault') {
  await sleep(CFG.pauseMs);
  sh('docker', 'unpause', KAFKA_CONTAINER);
  result.unpausedAt = now() - tStart;
}

// 전달 완료 대기
const deadline = Date.now() + 120_000;
while (delivered.size < CFG.rows && Date.now() < deadline) await sleep(250);
const tDone = now();
await probeLoop;
await Promise.all(probesInFlight);
sampling = false;
await sampler;

// ---- 집계 ----
const q = (arr, p) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.ceil(p * arr.length) - 1)] : null);
const probeMs = probes.filter((p) => !p.error).map((p) => p.ms);
const deliveredTimes = [...delivered.values()];
const afterSeed = samples.filter((s) => s.t >= tSeeded);
result.delivered = delivered.size;
result.timeToFirstDeliveredMs = firstDeliveredAt === null ? null : firstDeliveredAt - tSeeded;
result.timeToAllDeliveredMs = delivered.size === CFG.rows ? Math.max(...deliveredTimes) - tSeeded : null;
result.deliveredWithin5sOfSeed = deliveredTimes.filter((t) => t - tSeeded <= 5000).length;
result.probe = {
  count: probes.length,
  errors: probes.filter((p) => p.error).length,
  p50: q(probeMs, 0.5), p95: q(probeMs, 0.95), max: probeMs.length ? Math.max(...probeMs) : null,
  over1s: probeMs.filter((m) => m > 1000).length,
  over5s: probeMs.filter((m) => m > 5000).length,
};
result.pg = {
  maxIdleInTx: Math.max(0, ...afterSeed.map((s) => s.idle_in_tx)),
  maxNonIdle: Math.max(0, ...afterSeed.map((s) => s.non_idle)),
  maxLockWaiters: Math.max(0, ...afterSeed.map((s) => s.lock_waiters)),
  maxXactMs: Math.round(Math.max(0, ...afterSeed.map((s) => s.max_xact_ms))),
  // 앱 연결이 트랜잭션 안에서 머문 총 시간(샘플 수 × 200ms 근사)
  idleInTxSampleMs: afterSeed.filter((s) => s.idle_in_tx > 0).length * 200,
};
result.totalMs = tDone - tSeeded;

writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));

app.kill('SIGTERM');
await sleep(1500);
await consumer.disconnect();
await pool.end();
process.exit(0);
