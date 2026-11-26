#!/usr/bin/env node
/**
 * 성능 지표 결과 JSON(report/metric-schema.md)을 터미널 표로 보여 준다. 결과 파일의 값을 그대로 쓰고 지표 이름은 모른다.
 * 다른 프로젝트에 그대로 복사해 쓸 수 있도록 Node 표준 모듈에만 의존한다.
 *
 * 사용: node perf/print-report.mjs <결과 폴더>
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const dir = process.argv[2];
if (dir === undefined) {
  console.error('사용: node perf/print-report.mjs <결과 폴더>');
  process.exit(2);
}

const entries = await readdir(dir);
const files = entries
  .filter((name) => name.endsWith('.json'))
  .toSorted((a, b) => a.localeCompare(b));
if (files.length === 0) {
  console.error(`결과 파일이 없습니다: ${dir}`);
  process.exit(1);
}

function row(cells) {
  return `| ${cells.join(' | ')} |`;
}

for (const name of files) {
  // eslint-disable-next-line no-await-in-loop -- 파일 순서대로 출력한다.
  const report = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
  const lines = [
    '',
    `## ${report.metricSet}: ${report.title}`,
    '',
    row(['지표', 'id', 'kind', '값', '단위', '표본', '표본 일치']),
    row(['---', '---', '---', '---', '---', '---', '---']),
  ];
  for (const metric of report.metrics) {
    const samples = metric.samples ?? [];
    const held = samples.every((sample) => sample.value === metric.value);
    lines.push(
      row([
        metric.label,
        metric.id,
        metric.kind,
        String(metric.value),
        metric.unit,
        samples
          .map((sample) => `${sample.label}: ${sample.value}`)
          .join(', ') || '-',
        metric.kind === 'invariant' ? (held ? '예' : '아니오') : '-',
      ]),
    );
  }

  const pairs = (object) =>
    Object.entries(object)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
  lines.push(
    '',
    `stable: ${report.stable ? '예' : '아니오 (같은 실행에서 값이 달라짐)'}`,
    `params: ${pairs(report.params)}`,
    `env: ${pairs(report.env)}`,
    `결과 파일: ${path.join(dir, name)}`,
  );
  for (const [key, values] of Object.entries(report.details ?? {})) {
    lines.push(
      '',
      `${key} (${values.length})`,
      ...values.map((value) => `  ${value}`),
    );
  }

  console.log(lines.join('\n'));
}
