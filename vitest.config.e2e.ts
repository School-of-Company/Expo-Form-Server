import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // 앱 전체 부팅(DB·Kafka 접속)이 기본 10초를 넘길 수 있다.
    hookTimeout: 60_000,
  },
});
