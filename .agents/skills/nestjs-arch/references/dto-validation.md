# DTOs, Validation & Config

## Every Boundary Argument Is a DTO

The Zod schema is the single source of truth; the DTO class is generated from it.

```ts
// dto/create-pr.request.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createPrRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  installationId: z.number().int(),
  baseBranch: z.string(),
  itemIds: z.array(z.string()),
});

export class CreatePrRequestDto extends createZodDto(createPrRequestSchema) {}
```

```ts
// controller — binds and delegates, nothing else
@Post()
create(@Body() dto: CreatePrRequestDto): Promise<CreatePrResponseDto> {
  return this.prService.createPr(dto);
}

// service — takes the same DTO, not (owner, repo, installationId, baseBranch, itemIds)
async createPr(dto: CreatePrRequestDto): Promise<CreatePrResponseDto> { ... }
```

Why: adding a field doesn't ripple through every signature, argument order can't be mixed up, and the
validation rules live next to the shape they describe.

**DTOs must still be classes.** `createZodDto()` returns one precisely so the pipe and Swagger have a
runtime type to read — and a DTO must never be imported with `import type`, which erases exactly that
runtime type. Interfaces remain the right choice for internal domain types that never cross a boundary;
derive those from the schema rather than hand-writing them:
`type CreatePrRequest = z.infer<typeof createPrRequestSchema>`.

## Two Validation Layers

Don't conflate them:

- **Shape** (field presence, types, formats) — the global `ZodValidationPipe`:
  ```ts
  app.useGlobalPipes(new ZodValidationPipe());
  ```
  `z.object()` strips unknown properties on its own, so there is no `whitelist` flag to set; put
  `.strict()` on a schema that should reject them outright instead of dropping them. Query and path
  values arrive as strings — declare those fields with `z.coerce.number()` / `z.stringbool()` rather
  than converting inside the service.

  **Never `z.coerce.boolean()` for a query flag.** It is `Boolean(v)`, so every non-empty string is
  `true` — `?force=false` and `?force=0` both parse as `true`. `z.stringbool()` is the one that reads
  `'false'` / `'0'` / `'no'` / `'off'` as `false`.

  Coercion is also **mode-dependent**: a JSON request body already carries real types, so coercing there
  turns `true` into `1`. Coerce query and path values only.
- **Business rules** (does this repo exist, is this id real, is this state allowed) — plain code in the
  service. Throw; no fallback, no partial success, no silent skip.

`.refine()` belongs to the first layer, not the second: use it for rules that are still about shape (two
fields that must agree, a bound that depends on a sibling field). Anything needing a database or an
external call is a business rule and stays in the service.

## Dynamic Schemas

A form's field spec lives in JSONB, so the schema that validates a submission is built at runtime from
that spec rather than written at compile time. Assemble it in the service, validate with `safeParse`, and
map the `ZodError` to a domain exception — the global pipe only covers statically declared DTOs.

## Config

```ts
// app.module.ts
imports: [ConfigModule.forRoot({ isGlobal: true })],
```

```ts
constructor(private readonly config: ConfigService) {}

// getOrThrow fails fast at the first read when the value is missing
const appId = this.config.getOrThrow<string>('GITHUB_APP_ID');
const port = this.config.get<number>('PORT', 3000);
```

Never read `process.env` from a service — it hides what a module actually requires and can't be
substituted in tests. Keep tunable constants (TTLs, timeouts, retry counts) as module-level `const`s, not
env vars, unless they genuinely differ per environment.
