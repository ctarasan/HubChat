# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-22 (Agent A — PR #66 handoff cleanup)

## Current master

- Commit: `8c091c4` (includes merged PR **#65** reusable workflow docs)
- PR **#64** merged (Instagram rollout report)
- PR **#63** merged (agent report handoff protocol)

## In progress

- PR **#66** — Phase II-G2-D DB_ONLY readiness analysis
- Branch: `docs/phase-ii-g2-d-db-only-readiness-analysis`
- **Do not enable `DB_ONLY`**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Inbound webhooks | Env-based, unchanged — PASS |
| DB_ONLY | **Not enabled** |

## Agent A

- Branch: `docs/phase-ii-g2-d-db-only-readiness-analysis`
- PR: **#66**

## Agent B

- Status: Inactive

## Next step

1. ChatGPT review PR **#66**.
2. Keep monitoring `DB_WITH_ENV_FALLBACK`.
3. Do **not** enable `DB_ONLY` yet.
4. When later approved: trial **LINE** first, then Facebook, then Instagram.

## Universal workflow (not HubChat-specific)

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
