# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-19 (Agent A — IG-AUTH-2E.1 OAuth DM text adapter)

## Current master

- Master HEAD: `d4865e4` (PR **#248** IG-AUTH-2E.0 merged)
- IG-AUTH-2E.1: **IN PROGRESS (feature branch)** — OAuth text adapter foundation; no worker cutover

## Instagram OAuth status

| Phase | Status |
| --- | --- |
| 2A–2D | Merged — credential foundation, resolver, connect, identity, test connection |
| 2E.0 | Merged — outbound contract audit |
| 2E.1 | Feature branch — OAuth text provider client + service (flags default OFF) |
| 2E.2+ | Not started — image adapter, queue binding, worker cutover |

All OAuth flags default **OFF** (`FOUNDATION`, `CONNECT`, `TEST_CONNECTION`, `RUNTIME`, `OUTBOUND_TEXT`).

## Guardrails

- OAuth text service not wired to worker/outbox in 2E.1
- OAuth outbound must not fall back to Page token / ENV / legacy path
- Private reply, webhooks, refresh, legacy retirement — deferred past 2E

## Agent A

See [`docs/agent-reports/agent-a/latest.md`](agent-a/latest.md) — IG-AUTH-2E.1 OAuth DM text adapter.

## Agent B

See [`docs/agent-reports/agent-b/latest.md`](agent-b/latest.md).
