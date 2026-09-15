---
name: security-checklist
description: Verify security vulnerabilities — hardcoded secrets, SQL injection, JWT validation, API key masking, sensitive logging, authorization checks, and CSV export injection. Run before merging any auth or API-related changes.
---

# Security Checklist

## Verification Items

### 1. Hardcoded Secrets
- [ ] No API Key, Secret, Password in code?
- [ ] Read through `ConfigService.getOrThrow()`, never `process.env` inside a service?

Verification commands:

```bash
grep -rn "password\s*[:=]\s*['\"]" --include="*.ts" src/ test/
grep -rn "secret\s*[:=]\s*['\"]" --include="*.ts" src/ test/
grep -rn "apiKey\s*[:=]\s*['\"]" --include="*.ts" src/ test/

# process.env read outside ConfigModule wiring
grep -rn "process\.env" --include="*.ts" src/

# env files that must never be committed
git ls-files | grep -E '^\.env'

# YAML / JSON config
grep -rn "password\|secret\|apiKey" --include="*.yml" --include="*.yaml" --include="*.json" . \
  --exclude-dir=node_modules --exclude=pnpm-lock.yaml

# base64-looking literals (potential secrets)
grep -rnE "['\"][A-Za-z0-9+/]{40,}={0,2}['\"]" --include="*.ts" src/
```

**Limitations:**
- May miss secrets encoded in base64 or other formats
- May not detect secrets loaded from external sources at runtime
- May not find secrets in configuration files outside the codebase
- Manual review is still recommended for sensitive areas

### 2. SQL Injection
- [ ] Using repository methods or the query builder with bound parameters?
- [ ] No user input interpolated into raw SQL?

TypeORM binds `:named` parameters; a template literal in these positions means the value is being
concatenated into the statement instead.

```bash
grep -rn 'query(`' --include="*.ts" src/
grep -rnE '\.(where|andWhere|orWhere|having)\(`' --include="*.ts" src/
```

JSONB path access takes the same care — a key coming from a form field spec must be passed as a
parameter, never spliced into the `->>` expression.

### 3. JWT Verification
- [ ] Verifying JWT signature?
- [ ] Checking expiration time?
- [ ] Validating claims?

### 4. API Key Security
- [ ] Masking API Key in responses?
- [ ] Hashing API Key when storing?

### 5. Logging
- [ ] Not logging sensitive info (password, token, submission payloads)?
- [ ] Appropriate log level?

```bash
grep -rnE "logger\.(log|debug|warn|error)\(.*(password|token|secret|apiKey)" --include="*.ts" src/

# console.* bypasses the Nest logger entirely
grep -rn "console\." --include="*.ts" src/
```

### 6. Authorization
- [ ] `@UseGuards()` on auth-required endpoints, or a global `APP_GUARD`?
- [ ] Verifying access to own resources only — form and submission reads scoped to the owner?

```bash
grep -rn "@UseGuards\|APP_GUARD" --include="*.ts" src/
grep -rln "@Controller" --include="*.ts" src/
```

Compare the two lists: a controller with no guard and no global guard covering it is the finding.

### 7. CSV Export Injection
- [ ] Escaping submitted values that begin with `=`, `+`, `-`, or `@` before writing them to CSV?

Form answers are attacker-controlled text and land in a spreadsheet, where a leading `=` is executed as
a formula. Prefix such values with a single quote or wrap them, and always quote fields containing
commas, quotes, or newlines.

## References

Locate reference files at runtime:

```bash
find src -name "*.guard.ts" -o -name "*.store.ts" -o -name "*auth*" -not -path "*/node_modules/*"
```
