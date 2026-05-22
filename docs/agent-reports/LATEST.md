# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first. Last updated: 2026-05-22 (Agent A — G2-C3-R Instagram rollout **PASS**)

## Current master
- Commit: `7ce50d2` (+ PR **#64** docs pending merge)
- Merged foundation: **#62** Instagram runtime config, **#63** agent reports

## Runtime status (production)

| Area | Mode / status |
|------|----------------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — **PASS** |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — **PASS** |
| Instagram outbound | `DB_WITH_ENV_FALLBACK` — **PASS** (G2-C3-R complete) |
| Instagram inbound | **PASS** |
| Inbound webhooks | Env-based (unchanged) — **PASS** |
| Channel Settings / Test connection | **PASS** |
| Worker logs | Clean — **PASS**, no secret leak |

## Agent A latest
- Task: Phase II-G2-C3-R Instagram rollout report update
- Branch: `docs/phase-ii-g2-c3-r-instagram-rollout-report`
- PR: **#64** — docs: Instagram rollout **PASS**
- Next: Merge #64; monitor Instagram runtime; plan G2-D (not `DB_ONLY` yet)

## Agent B latest
**Inactive** — no work unless requested.

## Recommended next step
1. Merge PR **#64** (agent reports on `master`).
2. Monitor Instagram `DB_WITH_ENV_FALLBACK` (errors, fallback reasons in safe logs).
3. Plan **Phase II-G2-D** runtime cleanup / `DB_ONLY` readiness — do not cut over to `DB_ONLY` without explicit approval.

## Detail report
[`agent-a/2026-05-22-phase-ii-g2-c3-r-instagram-db-fallback-rollout.md`](./agent-a/2026-05-22-phase-ii-g2-c3-r-instagram-db-fallback-rollout.md)
