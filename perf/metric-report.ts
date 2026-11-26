/**
 * 성능 지표 결과 JSON(report/metric-schema.md, schemaVersion 1)을 만드는 공통 헬퍼.
 *
 * 다른 프로젝트에 그대로 복사해 쓸 수 있도록 Node 표준 모듈에만 의존한다. 프로젝트 고유 값(엔드포인트, 시드,
 * 지표 이름)은 이 파일에 두지 않고 호출하는 측정 spec이 넘긴다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

export type MetricSample = { label: string; value: number };

/** `max`: 값이 상한 이하인지 본다. `invariant`: 표본 값이 모두 같은지 본다(상한이 있으면 그것도 본다). */
export type Metric =
  | { id: string; label: string; kind: 'max'; unit: string; value: number }
  | {
      id: string;
      label: string;
      kind: 'invariant';
      unit: string;
      value: number;
      samples: MetricSample[];
    };

export type MetricReportInput = {
  /** 결과 파일 이름이자 상한 파일의 키. 예: `public-answers` */
  metricSet: string;
  /** 사람이 읽는 제목. 예: 측정한 엔드포인트 */
  title: string;
  /** 측정 조건(시드 크기 등). 보고 쪽은 표시만 한다. */
  params: Record<string, string | number | boolean>;
  metrics: Metric[];
  /** 접어서 보여 줄 문자열 목록(실행된 SQL 등). 보고 쪽은 표시만 한다. */
  details?: Record<string, string[]>;
  /** 같은 실행 안에서 두 번 잰 값이 같았는지. */
  stable: boolean;
  /** 런타임 버전 등. `node`는 자동으로 채운다. */
  env?: Record<string, string>;
};

export function maxMetric(
  id: string,
  label: string,
  unit: string,
  value: number,
): Metric {
  return { id, label, kind: 'max', unit, value };
}

/** 첫 표본 값을 대표값으로 쓴다. 표본이 서로 다르면 보고 쪽이 실패로 판정한다. */
export function invariantMetric(
  id: string,
  label: string,
  unit: string,
  samples: MetricSample[],
): Metric {
  if (samples.length < 2) {
    throw new Error(`invariant metric ${id} needs at least 2 samples`);
  }

  return {
    id,
    label,
    kind: 'invariant',
    unit,
    value: samples[0].value,
    samples,
  };
}

export function isInvariantHeld(metric: Metric): boolean {
  return (
    metric.kind !== 'invariant' ||
    metric.samples.every((sample) => sample.value === metric.value)
  );
}

/** 결과를 `$RUNNER_TEMP/perf-metrics/<metricSet>.json`에 쓰고 경로를 돌려준다. CI 밖에서는 OS 임시 폴더를 쓴다. */
export async function writeMetricReport(
  input: MetricReportInput,
): Promise<string> {
  for (const metric of input.metrics) {
    if (!Number.isFinite(metric.value) || metric.value < 0) {
      throw new Error(`metric ${metric.id} must be a non-negative number`);
    }
  }

  const report = {
    schemaVersion: 1,
    metricSet: input.metricSet,
    title: input.title,
    source: {
      sha: process.env.GITHUB_SHA ?? null,
      // PR이 아닌 실행에서는 워크플로가 빈 문자열을 넘긴다.
      baseSha:
        (process.env.PERF_BASE_SHA ?? '') === ''
          ? null
          : process.env.PERF_BASE_SHA,
      event: process.env.GITHUB_EVENT_NAME ?? null,
      runId: Number(process.env.GITHUB_RUN_ID ?? 0),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 0),
    },
    env: { node: process.version, ...input.env },
    params: input.params,
    metrics: input.metrics,
    details: input.details ?? {},
    stable: input.stable,
  };

  const outDir = path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'perf-metrics');
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${input.metricSet}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}
