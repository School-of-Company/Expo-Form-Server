---
name: api-design
description: REST API design guide for new endpoints — RESTful URL structure, DTO-only arguments for controllers and services, query parameter binding and coercion rules, OpenAPI annotations, and response format. Use when adding or changing a controller route.
---

# REST API Design Guide

## URL Design

- RESTful principles: `/v1/auth/api-keys`
- Use plural: `/students`, `/clubs`
- Hierarchy: `/students/{id}/projects`

## Everything Crosses a Boundary as a DTO

Controllers and services never take loose positional parameters. Every argument that crosses a boundary is
a DTO, and every response is a DTO:

```ts
// request body → RequestDto
@Post('api-keys')
create(@Body() dto: CreateApiKeyRequestDto): Promise<ApiKeyResponseDto>

// query parameters → @Query() + RequestDto, not a pile of primitives
@Get('students')
query(@Query() dto: QueryStudentRequestDto): Promise<StudentResponseDto[]>

// service takes the same DTO — not (name, grade, status, page, size)
query(dto: QueryStudentRequestDto): Promise<StudentResponseDto[]>
```

Why: adding a field doesn't ripple through every signature, argument order can't be mixed up, and the
validation rules live next to the shape they describe.

DTO classes come from `createZodDto()` — see `nestjs-arch`'s `references/dto-validation.md` for how the
schema and the class relate.

## Binding Rules

- **`@Query()` + RequestDto** — the default for query parameters. Everything arrives as a string, so
  declare non-string fields with `z.coerce.number()` / `z.stringbool()` rather than converting in the
  service. **Never `z.coerce.boolean()`** — it is `Boolean(v)`, so `?force=false` parses as `true`.
  Coerce only query and path values; a JSON body already carries real types.
- **`@Query('name')`** — only for a single, self-contained value that will never grow (e.g. `?force=true`).
  Two or more parameters means a DTO.
- **`@Param()`** — path variables stay as primitives; they're part of the URL, not a payload.

## Query Parameters

- Filtering: `?status=active`
- Pagination: `?page=0&size=20`
- Sorting: `?sort=createdAt,desc`

## OpenAPI Documentation

```ts
@ApiOperation({ summary: 'Create API key', description: '...' })
@ApiResponse({ status: 201, type: ApiKeyResponseDto })
@Post('api-keys')
create(@Body() dto: CreateApiKeyRequestDto): Promise<ApiKeyResponseDto>
```

Zod-derived DTOs carry their own schema, so request and response bodies document themselves once the
classes are named in the signature — don't restate fields with `@ApiProperty`.

## Response Format

- Success: return the `ResponseDto` directly — no envelope/wrapper type. The HTTP status carries the
  outcome.
- Error: throw a domain exception → the global exception filter turns it into the error body.

Don't wrap successful payloads in a `data` field. Clients read the resource straight from the body, so an
envelope only adds a layer to unwrap on every call.

## Exports Belong to the Report Service

Do not build CSV or Excel endpoints here. The 리포트 service composes them from other services' APIs, so
this service's job is to expose submission data as JSON — including the field spec needed to interpret
it. CSV escaping and formula-injection guarding happen where the CSV is generated, not here.
