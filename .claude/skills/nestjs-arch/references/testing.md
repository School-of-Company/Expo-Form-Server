# Test Strategy

## Test Level by Layer

- **Service (핵심 비즈니스 로직)** — unit test 위주로 많이 작성한다. 모든 외부 의존성을 mock으로 대체하고,
  분기(decision branch)마다 케이스를 채운다. 파일명은 `*.spec.ts`, `vitest.config.ts`(`pnpm test`)가 실행한다.
- **Repository / Store (DB 쿼리)** — mock으로는 쿼리 자체의 정확성을 검증할 수 없으므로 integration test로
  실제(또는 테스트용) DB에 대해 검증한다. 파일명은 `*.integration-spec.ts`로 옆에 colocate하고,
  `vitest.config.integration.ts`(`pnpm test:integration`)가 실행한다.

## Unit Test Style

### Instantiate Directly, Don't Build a TestingModule

For a plain service, `new` it with object-literal mocks — faster to read and write than wiring a module:

```ts
import { beforeEach, describe, vi, type Mock } from 'vitest';

describe('ReviewDispatcherService', () => {
  let idempotencyStore: { exists: Mock; markProcessed: Mock };
  let kafkaProducer: { send: Mock };
  let service: ReviewDispatcherService;

  beforeEach(() => {
    idempotencyStore = { exists: vi.fn(), markProcessed: vi.fn() };
    kafkaProducer = { send: vi.fn() };

    service = new ReviewDispatcherService(
      idempotencyStore as unknown as IdempotencyStore,
      kafkaProducer as unknown as KafkaProducerService,
    );
  });
});
```

Use `Test.createTestingModule()` only when the wiring itself is what's under test — module resolution,
guards, interceptors, or an end-to-end request path.

### What to Cover

Test the **branches that carry a decision**, not every method:

- duplicate detection hit vs. miss
- completed / failed routing
- publish or write failure propagating instead of being swallowed

Skip trivial delegation (a method that only forwards to one collaborator) — the test would just restate
the implementation.

### Mocks

Mock every external client; a unit test must never open a real Redis, Kafka, or HTTP connection. Fixtures
(payloads, contexts) go at the top of the `describe` block as plain `const`s so each test reads as
"given this payload, expect this branch".
