# Agent B - CCW-0 Channel Connection Data Scope Audit

## Status

Complete - analysis / UI audit only (no product UI changes).

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | CCW-0 |
| Date | 2026-06-09 |
| Branch | `docs/ccw-0-channel-connection-data-scope-audit` |
| Primary doc | `docs/ccw-0-channel-connection-data-scope-audit.md` |
| Master at audit | `d1389bb` |

## Summary

Audited Dashboard Inbox, chat header/context, Leads, Work Queue, Analytics, Channel Settings, and future Assisted Channel Connection Wizard for **channel connection data scope** when tenants replace Facebook Page / LINE / Instagram accounts.

**Root cause:** surfaces filter by `tenant_id` and channel **type**, not active connection identity (`provider_page_id`, connection record).

**Recommendations:**

- Default UI: active connections only
- ADMIN/MANAGER toggle: include disconnected/test channels (off by default)
- Show connection identity label (Page name); keep lead source badge separate
- Old data: hidden by default, marked when toggle on — not auto-deleted
- Proposed CCW-1A (API scope) + CCW-1B (UI/filters/empty states)

## Scope confirmation

Docs-only audit. No backend/API/DB/worker/UI/runtime changes. Profile image enrichment, DB_ONLY, resolver flag, Marketplace, CDP out of scope.

## Verification

Run at commit: diff --check, bidi scan, typecheck, lint, test, build.

## Next action

Agent A: CCW-1A API `connectionScope` contract. Agent B/C: CCW-1B UI after API lands.
