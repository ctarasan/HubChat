# SmartKorp HubChat — Project State

Stable reference for architecture, channels, runtime cutover, and guardrails. Update when facts change; use [`LATEST.md`](./LATEST.md) for day-to-day handoff.

## Architecture

```
API (Vercel / Next.js) → outbox / queue (Supabase Postgres) → worker (Railway) → channel adapters → providers
```

- **Dashboard / API:** Vercel-hosted Next.js app
- **Data:** Supabase (Postgres, RPC, storage as configured)
- **Worker:** Railway — inbound loop, outbound loop, outbox relay, observability
- **Pattern:** Fast API acknowledgment; durable queue/outbox; idempotent workers; channel adapters per provider

## Active channels

| Channel | Inbound | Outbound | Notes |
|---------|---------|----------|--------|
| **LINE** | Webhook (env) | Env + optional DB runtime | Tenant-scoped runtime config in `channel_settings` |
| **Facebook** | Webhook (env) | Env + optional DB runtime | Messenger DM, comments, private reply flows |
| **Instagram** | Webhook (env) | Env + optional DB runtime | DM text foundation; Page token + Page ID for Graph send |

## Runtime config state (outbound)

Controlled by worker env modes: `ENV_ONLY` (default), `DB_WITH_ENV_FALLBACK`, `DB_ONLY`.

| Channel | Foundation PR | Production mode (expected) | Rollout status |
|---------|---------------|----------------------------|----------------|
| **LINE** | #57 | `DB_WITH_ENV_FALLBACK` | **PASS** |
| **Facebook** | #61 | `DB_WITH_ENV_FALLBACK` | **PASS** |
| **Instagram** | #62 | `DB_WITH_ENV_FALLBACK` | **PASS** (Phase II-G2-C3-R, 2026-05-22, operator rollout + smoke) |

Inbound webhook verification remains **env-based** during outbound runtime phases—do not change webhook env as part of outbound cutover unless a dedicated phase says so.

## Agent responsibilities

- **Agent A:** Backend, API, domain, workers, channel adapters, runtime config, security-sensitive paths, migrations (when phase requires), ops rollout reports
- **Agent B:** Frontend, UX, UI tests, Playwright E2E (only when requested)
- **ChatGPT:** Planner/reviewer; read [`LATEST.md`](./LATEST.md) first; outcomes PASS / PASS WITH NOTES / NEEDS CHANGES / BLOCKED

## Guardrails (do not violate without explicit phase approval)

1. **No secrets in reports or logs** — tokens, passwords, raw env values, service role keys
2. **Outbound runtime phases** — do not change inbound webhook verification unless the phase explicitly requires it
3. **No migrations** unless the phase requires it
4. **No `package.json` / lockfile** changes unless the phase requires it
5. **No UI/CSS** changes on Agent A backend-only tasks
6. **No queue/outbox schema** changes unless the phase requires it
7. **Runtime cutover** — LINE/Facebook/Instagram outbound use `DB_WITH_ENV_FALLBACK` in production; do not switch to `DB_ONLY` without an approved phase
8. Use **present/missing** and mode names in ops reports, not secret values

## Channel Settings

- DB table: `channel_settings` (per tenant, per channel: LINE, FACEBOOK, INSTAGRAM)
- Admin UI: `/dashboard/channel-settings`
- Test connection: `POST /api/channel-settings/[channel]/test-connection`
- Secrets stored server-side; API returns fingerprints/state only

## Current recommended next phase

**Phase II-G2-D analysis complete — monitor before any `DB_ONLY` trial**

- Analysis doc: [`docs/phase-ii-g2-d-db-only-readiness-analysis.md`](../phase-ii-g2-d-db-only-readiness-analysis.md)
- **Monitor** all channels on `DB_WITH_ENV_FALLBACK` (worker logs, `fallbackReason`, outbound errors).
- Do **not** enable `DB_ONLY` without ChatGPT + operator approval and per-channel checklist.
- Approved rollout order when ready: **LINE → Facebook → Instagram** (conservative).
- Inbound webhooks remain env-based until a dedicated inbound runtime phase.

## Related docs

- [`README.md`](./README.md) — HubChat handoff protocol (this folder)
- [`REPORT_TEMPLATE.md`](./REPORT_TEMPLATE.md) — report template
- [`docs/ai-agent-project-workflow.md`](../ai-agent-project-workflow.md) — **universal** AI agent workflow (reusable across projects)
- [`docs/ai-agent-project-workflow-template.md`](../ai-agent-project-workflow-template.md) — new-repo bootstrap checklist
- [`SKILL.md`](../../SKILL.md) — HubChat skill and working rules
- [`docs/ai-agent-collaboration-rules.md`](../ai-agent-collaboration-rules.md) — HubChat Agent A/B collaboration
