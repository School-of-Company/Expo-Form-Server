---
name: test
description: Run tests with coverage analysis and report results. Determines appropriate test scope (single file / pattern / all) based on context and analyzes failures in detail.
allowed-tools: Bash, Glob, Grep
---

## Determine Test Scope

Based on the user's request or changed files, choose the narrowest scope that covers the change:

| Scope             | Command                             |
|-------------------|-------------------------------------|
| Single file       | `pnpm vitest run <path>`            |
| Matching name     | `pnpm vitest run -t "<test name>"`  |
| All unit tests    | `pnpm test`                         |
| E2E tests         | `pnpm test:e2e`                     |
| With coverage     | `pnpm test:cov`                     |

Unit and e2e runs use separate configs (`vitest.config.ts` and `vitest.config.e2e.ts`), so `pnpm test`
does **not** cover `test/*.e2e-spec.ts`. Run both before concluding a change is green.

## Run Tests

Execute the chosen command. Vitest reports failures in full by default — add `--reporter=verbose` when
you need per-test output for a passing run.

```bash
pnpm vitest run --reporter=verbose
```

Do not use watch mode (`pnpm test:watch`) in an automated run; it never exits.

## Analyze Results

After the run, report:

- Total tests / passed / failed / skipped
- Execution time
- For each failure:
  - Test name and file
  - Failure message and root cause
  - The assertion diff, and the relevant stack frames pointing into `src/`

If there are failures, read the relevant source files and suggest the most likely fix. When a test fails
only inside a full run but passes alone, suspect shared state between files rather than the test itself.
