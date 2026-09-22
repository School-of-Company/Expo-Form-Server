# GitHub Labels Reference

Select **1–2 labels** from the PR-eligible list below. Do NOT use issue-only labels.

Verify against the repository before relying on this file — labels drift:

```bash
gh label list --limit 30 --json name -q '.[].name'
```

Every label name contains an emoji and, in some cases, a space. Pass them **quoted and verbatim**
(`--label "✨ Feature"`); a name that does not match exactly makes `gh pr create` fail outright.

## PR-Eligible Labels

| Label             | When to use                                    |
|-------------------|------------------------------------------------|
| `✨ Feature`      | New feature                                    |
| `🐞 Bug`          | Bug fix                                        |
| `♻️ Refactor`     | Refactoring with no behavior change            |
| `📝 Docs`         | Docs-only changes (README, skill files, comments) |
| `✅ Test`         | Test-only additions or fixes                   |
| `⚙ Setting`       | Build config, tooling, dependencies, env setup |
| `⚡️performance`   | Performance improvement                        |
| `🌏 Deploy`       | Deployment / CI / release work                 |
| `⚡️ Simple`       | Trivial change (typo, one-liner)               |

## Issue-Only Labels (do NOT assign to a PR)

| Label                    | Reason                        |
|--------------------------|-------------------------------|
| `🙋‍♂️ Question`            | Questions belong on issues    |
| `🪡 Want`                 | Feature requests, not changes |
| `0️⃣ Priority: Critical`  | Priority is triaged on issues |
| `1️⃣ Priority: High`      | 〃                             |
| `2️⃣ Priority: Medium`    | 〃                             |
| `3️⃣ Priority: Low`       | 〃                             |

## Quick Decision

```
Bug fix?                    → 🐞 Bug
New feature?                → ✨ Feature
Behavior-preserving cleanup? → ♻️ Refactor
Docs only?                  → 📝 Docs
Tests only?                 → ✅ Test
Config / deps / tooling?    → ⚙ Setting
Unsure?                     → ✨ Feature
```
