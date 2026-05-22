# SmartKorp HubChat — Project State

Stable reference for architecture, channels, runtime cutover, and guardrails.

Update when facts change.

Use [`LATEST.md`](./LATEST.md) for day-to-day handoff.

## Architecture

```text
API (Vercel / Next.js)
  → outbox / queue (Supabase Postgres)
  → worker (Railway)
  → channel adapters
  → providers
```

- **Dashboard / API:** Vercel-hosted Next.js app
- **Data:** Supabase (Postgres, RPC, storage as configured)
- **Worker:** Railway — inbound, outbound, outbox relay, observability
- **Pattern:** Fast API ack; durable queue/outbox; idempotent workers

## Active channels

| Channel | Inbound | Outbound | Notes |
|---------|---------|----------|--------|
| **LINE** | Webhook (env) | Env + optional DB runtime | Tenant `channel_settings` |
| **Facebook** | Webhook (env) | Env + optional DB runtime | Messenger DM, comments |
| **Instagram** | Webhook (env) | Env + optional DB runtime | DM; Page token + Page ID |

## Runtime config state (outbound)

Worker env modes:

- `ENV_ONLY` (default)
- `DB_WITH_ENV_FALLBACK` (production)
- `DB_ONLY` (not enabled)

| Channel | Foundation PR | Production mode | Rollout |
|---------|---------------|-----------------|---------|
| **LINE** | #57 | `DB_WITH_ENV_FALLBACK` | **PASS** |
| **Facebook** | #61 | `DB_WITH_ENV_FALLBACK` | **PASS** |
| **Instagram** | #62 | `DB_WITH_ENV_FALLBACK` | **PASS** |

Inbound webhook verification remains **env-based**.

Do not change webhook env during outbound cutover unless a dedicated phase says so.

## Agent responsibilities

- **Agent A:** Backend, API, domain, workers, adapters, runtime config, security
- **Agent B:** Frontend, UX, UI tests, Playwright E2E (when requested)
- **ChatGPT:** Planner/reviewer; read [`LATEST.md`](./LATEST.md) first

## Guardrails (do not violate without explicit phase approval)

1. **No secrets in reports or logs**
2. **Outbound runtime phases** — do not change inbound webhook verification unless required
3. **No migrations** unless the phase requires it
4. **No `package.json` / lockfile** changes unless the phase requires it
5. **No UI/CSS** changes on Agent A backend-only tasks
6. **No queue/outbox schema** changes unless the phase requires it
7. **Runtime cutover** — do not switch to `DB_ONLY` without approved phase
8. Use **present/missing** and mode names in ops reports, not secret values

## Channel Settings

- DB table: `channel_settings` (per tenant, per channel)
- Admin UI: `/dashboard/channel-settings`
- Test connection: `POST /api/channel-settings/[channel]/test-connection`
- Secrets stored server-side; API returns fingerprints/state only

## Current recommended next phase

**Monitor `DB_WITH_ENV_FALLBACK` — DB_ONLY not enabled**

- LINE / Facebook / Instagram outbound: **`DB_WITH_ENV_FALLBACK` — PASS**
- Inbound webhooks: **env-based**, unchanged
- G2-D analysis:
  [`docs/phase-ii-g2-d-db-only-readiness-analysis.md`](../phase-ii-g2-d-db-only-readiness-analysis.md)
- Monitor before any `DB_ONLY` trial
- Future rollout order (when approved): **LINE → Facebook → Instagram**
- Do **not** enable `DB_ONLY` without ChatGPT + operator approval

## Related docs

- [`README.md`](./README.md) — HubChat handoff protocol
- [`REPORT_TEMPLATE.md`](./REPORT_TEMPLATE.md) — report template
- [`docs/ai-agent-project-workflow.md`](../ai-agent-project-workflow.md) — universal workflow
- [`docs/ai-agent-project-workflow-template.md`](../ai-agent-project-workflow-template.md)
- [`SKILL.md`](../../SKILL.md) — HubChat skill
- [`docs/ai-agent-collaboration-rules.md`](../ai-agent-collaboration-rules.md)

