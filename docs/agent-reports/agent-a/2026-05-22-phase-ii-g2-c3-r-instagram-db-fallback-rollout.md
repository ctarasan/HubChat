# Agent Report

## Metadata
- Agent: A
- Date: 2026-05-22
- Phase / Task: Phase II-G2-C3-R — Instagram `DB_WITH_ENV_FALLBACK` controlled rollout (ops)
- Branch: `docs/phase-ii-g2-c3-r-instagram-rollout-report`
- Base commit: `7ce50d2`
- Head commit: *(see PR #64 merge commit)*
- PR: **#64**
- Status: **PASS / completed** (operator rollout + smoke confirmed)

## Goal
Roll out Instagram outbound runtime config from `ENV_ONLY` to `DB_WITH_ENV_FALLBACK` on Railway worker only, with pre/post smoke. No application code changes.

## Scope
- Ops: Railway worker `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` only
- No `DB_ONLY`, no LINE/Facebook mode changes, no inbound webhook/Vercel/schema/package/UI changes

## Resolved blocker (historical)
- **Agent environment:** Railway CLI OAuth was expired (`invalid_grant`) during initial report — agent could not apply env or read logs.
- **Resolution:** Operator completed Railway variable set, worker redeploy, Channel Settings prep, and full smoke test.

## Final runtime env snapshot (no secret values)

| Variable | Status |
|----------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` (confirmed) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` |
| `SUPABASE_URL` | present |
| `SUPABASE_SERVICE_ROLE_KEY` | present |
| `META_GRAPH_VERSION` | present |
| Token env vars (`FACEBOOK_PAGE_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, etc.) | present/missing not re-audited — **values never printed** |

## Rollout (operator)

| Action | Result |
|--------|--------|
| Set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **Done** |
| Railway worker redeploy/restart | **Done** |
| Rollback needed | **No** |

## Smoke test result (operator)

| Area | Result |
|------|--------|
| Instagram outbound text | PASS |
| Instagram inbound webhook | PASS |
| Facebook outbound | PASS |
| LINE outbound | PASS |
| Channel Settings / Test connection | PASS |
| Worker logs | PASS — clean, no secret leak |
| Secret leak check | PASS |

## Worker log summary (operator)
- No new Graph API token errors reported
- No runtime resolver errors reported
- Instagram runtime mode logged safely as `DB_WITH_ENV_FALLBACK` (per operator smoke)
- No raw tokens or secrets in logs

## DB sanity (post-rollout send)
**Not checked during operator smoke** — do not infer queue/message rows from this report.

## Pre-rollout baseline (historical, agent capture)
Before operator rollout, Supabase showed recent Instagram outbound queue **DONE** and message **SENT**. INSTAGRAM `channel_settings` row was absent in an earlier agent snapshot; operator confirmed Channel Settings / Test connection **PASS** at rollout time.

## Final status

| Item | Value |
|------|--------|
| Rollout result | **PASS** |
| LINE outbound runtime | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound runtime | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound runtime | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram inbound | PASS |
| Rollback needed | No |

## Guardrails confirmation
- No secrets printed: yes
- No app/API/worker/runtime code change: yes
- No migration / package / UI change: yes
- No inbound webhook env change: yes
- No LINE/Facebook runtime mode change during Instagram rollout: yes

## Next recommended step
- Monitor Instagram `DB_WITH_ENV_FALLBACK` in production (worker logs, outbound failures).
- Plan Phase II-G2-D runtime cleanup / `DB_ONLY` readiness — **do not enable `DB_ONLY` yet**.

## Reviewer notes for ChatGPT
- Instagram outbound runtime cutover is **complete** for `DB_WITH_ENV_FALLBACK`.
- Merge PR **#64** to persist handoff on `master`.
