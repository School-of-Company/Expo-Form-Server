import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    // 에이전트 작업용 worktree(`.claude/worktrees`)의 사본까지 돌지 않게 한다.
    exclude: ['**/node_modules/**', '.claude/**'],
  },
});
