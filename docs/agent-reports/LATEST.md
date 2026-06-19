# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-19 (Agent A — IG-AUTH-2E.0 outbound contract audit)

## Current master

- Master HEAD: `38b35a8` (PR **#247** IG-AUTH-2D + PR **#246** review prep merged)
- IG-AUTH-2E.0: **IN PROGRESS (docs branch)** — outbound cutover audit/design only; no runtime changes

## Instagram OAuth status

| Phase | Status |
| --- | --- |
| 2A–2D | Merged — credential foundation, resolver, connect, identity, test connection |
| 2E.0 | Docs audit — legacy Page-token outbound mapped; OAuth delivery not wired |
| 2E.1+ | Not started — text/image adapter, queue binding, worker cutover |

All OAuth flags default **OFF** (`FOUNDATION`, `CONNECT`, `TEST_CONNECTION`, `RUNTIME`).

## Guardrails

- No OAuth UI, no production flag-on, no live Meta calls in 2E.0
- OAuth outbound must not fall back to Page token / ENV / legacy path
- Private reply, webhooks, refresh, legacy retirement — deferred past 2E

## Agent A

See [`docs/agent-reports/agent-a/latest.md`](agent-a/latest.md) — IG-AUTH-2E.0 outbound contract audit.

## Agent B

See [`docs/agent-reports/agent-b/latest.md`](agent-b/latest.md).
