import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/** 성능 지표 측정 spec만 돈다(report/metric-plan.md). 기본 test·test:integration의 include와 겹치지 않는 이름을 쓴다. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/metrics/**/*.metrics-spec.ts'],
    // 쿼리 수를 다른 spec과 섞이지 않게 센다.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
