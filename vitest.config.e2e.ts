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
    // e2e 파일마다 앱을 띄우며 같은 DB에 스키마를 맞추므로 동시에 돌리면 충돌한다.
    fileParallelism: false,
  },
});
