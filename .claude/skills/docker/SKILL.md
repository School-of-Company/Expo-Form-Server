---
name: docker
description: Dockerfile and docker-compose authoring guide — multi-stage builds, layer caching, security best practices, and compose service wiring.
---

# Docker Guide

## Dockerfile

### Multi-stage build

Three stages: build the app, resolve production-only dependencies separately, then copy both into a
runtime image that carries no toolchain.

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/main"]
```

`package.json` sets `"type": "module"`, so it must be present in the runtime image — Node reads it to
decide the module format for `dist/main.js`.

### Layer caching rules

- `COPY package.json pnpm-lock.yaml` first, install, then `COPY` source
- Use `--frozen-lockfile` so a stale lockfile fails the build instead of silently resolving new versions
- Only invalidate layers that actually changed

### Security

- Use specific digest tags, not `latest`
- Run as non-root: `RUN addgroup -S app && adduser -S app -G app` then `USER app`
- Never `COPY . .` before installing dependencies
- Keep `.env` out of the image — pass configuration in as environment variables

## docker-compose.yml

```yaml
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://app:app@db:5432/expoform
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: expoform
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app -d expoform']
      interval: 10s
      retries: 5
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

`condition: service_healthy` matters here — Postgres accepts TCP connections before it is ready to serve
queries, so without the healthcheck the app races the database on startup.

## .dockerignore

```
.git
node_modules
dist
*.log
.env
.env.*
```
