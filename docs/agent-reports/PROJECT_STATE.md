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
| **Instagram** | #62 | `ENV_ONLY` (default until ops sets mode) | Foundation merged; **DB rollout pending** |

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
7. **Default runtime mode** remains `ENV_ONLY` until ops explicitly sets worker env for cutover
8. Use **present/missing** and mode names in ops reports, not secret values

## Channel Settings

- DB table: `channel_settings` (per tenant, per channel: LINE, FACEBOOK, INSTAGRAM)
- Admin UI: `/dashboard/channel-settings`
- Test connection: `POST /api/channel-settings/[channel]/test-connection`
- Secrets stored server-side; API returns fingerprints/state only

## Current recommended next phase

**Phase II-G2-C3-R — Instagram `DB_WITH_ENV_FALLBACK` controlled rollout**

- **Ops-only** on Railway worker: set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK`
- Do **not** set `DB_ONLY` without explicit approval
- Do **not** change LINE/Facebook runtime modes during Instagram rollout
- Do **not** change code unless a production bug is found
- Prerequisites: Instagram Channel Settings configured, Test connection **READY**, safe env snapshot documented in agent report

## Related docs

- [`README.md`](./README.md) — handoff protocol
- [`REPORT_TEMPLATE.md`](./REPORT_TEMPLATE.md) — report template
- [`SKILL.md`](../../SKILL.md) — project skill and working rules
- [`docs/ai-agent-collaboration-rules.md`](../ai-agent-collaboration-rules.md) — Agent A/B collaboration
