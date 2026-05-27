# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-27 (Agent A - Phase II-M2-B)

## Current master

- Base: `80316fa` — PR **#86** M2-A marketing automation bridge mapping merged
- PR **#85** outbound terminal-state guard merged
- Outbound false-DONE incident: **closed**

## In progress

- PR (pending) — Phase II-M2-B Marketing Automation Bridge Outbox Foundation
- Branch: `feature/phase-ii-m2-b-marketing-bridge-outbox`
- Status: **Complete on branch** — durable outbox + enqueue use case; no worker/external send

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| Facebook / Instagram / LINE outbound smoke | PASS |
| `AGENT_MESSAGE_SENT` + `delivery_status=SENT` | PASS |
| Marketing bridge mapping (M2-A) | Merged |
| Marketing bridge outbox (M2-B) | On branch — migration required before use |

## Agent A

- Latest: `docs/agent-reports/agent-a/latest.md`
- Historical: `docs/agent-reports/agent-a/2026-05-27-phase-ii-m2-b-marketing-bridge-outbox.md`

## Agent B

- Status: **Inactive** (M2-B analysis complete)

## Next step

1. Review / merge M2-B PR; apply Supabase migration.
2. M2-C: producer wiring + delivery worker (future).

## Universal workflow

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
