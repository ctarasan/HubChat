# CCW-1B - Channel Connection Scope UI Preparation

**Status:** Draft / planning branch — **do not merge before CCW-1A API**
**Agent:** B
**Date:** 2026-06-09
**Branch:** `feature/ccw-1b-channel-connection-scope-ui`
**Depends on:** [CCW-0 audit](./ccw-0-channel-connection-data-scope-audit.md), CCW-1A API (Agent A)

---

## Purpose

Prepare UI model, components, filter query builders, and tests for connection-scoped operator surfaces **without** wiring Dashboard/Leads/Work Queue until CCW-1A lands.

---

## API fields consumed (CCW-1A proposal)

| Endpoint | Query | Response fields |
|----------|-------|-----------------|
| `GET /api/conversations` | `connectionScope=active\|all` (default `active`) | `connection_label`, `connection_status` |
| `GET /api/leads` | `connectionScope=active\|all` | `connectionLabel`, `connectionStatus` |
| `GET /api/workflow/items` | `connectionScope` (if added) | `connectionLabel`, `connectionStatus` (TBD) |
| `GET /api/analytics/overview` | optional scope param (TBD) | scope metadata in `pageInfo` (TBD) |

**UI rule:** display `connection_label` / `connectionLabel` as-is when safe. Never render `provider_page_id`, tokens, PSID, or URLs.

---

## Prep deliverables (this branch)

| Artifact | Role |
|----------|------|
| `src/ui/channelConnectionScopeModel.ts` | Query suffix, label display, empty states, role gating |
| `src/ui/ChannelConnectionLabel.tsx` | Connection name + optional Disconnected chip |
| `src/ui/ChannelConnectionScopeToggle.tsx` | ADMIN/MANAGER checkbox (not wired) |
| `src/ui/dashboardInboxFilters.ts` | `includeDisconnectedConnections` + query suffix |
| `src/ui/leadsPageModel.ts` | Leads filter + URL builder prep |
| Tests | Model + prep wiring guards |

**Not wired yet:** `DashboardPage.tsx`, `LeadsPage.tsx`, `workQueueUi.tsx`, `AnalyticsPage.tsx`

---

## Target UI behavior (post CCW-1A merge)

### Dashboard Inbox

- Default: active connections only (API default).
- ADMIN/MANAGER: toggle **Include disconnected channels** -> `connectionScope=all`.
- SALES: no toggle; always active scope.
- Row: lead source badge + **connection label** line.

### Chat header / context

- **Lead source:** `Facebook · Comment` (existing SRC-1B).
- **Connection:** `Acme Retail Page` (new `ChannelConnectionLabel`).
- Banner when viewing disconnected thread: `This conversation is from a disconnected channel`.

### Leads

- Connection label column/sub-label.
- Same scope toggle in filter bar (ADMIN/MANAGER).
- Disconnected chip when override enabled.

### Work Queue

- If API adds fields: `ChannelConnectionLabel`.
- Else: channel badge + helper text from `resolveWorkQueueConnectionFallback` (no fake precision).

### Analytics

- Banner from `resolveAnalyticsConnectionScopeBanner` until API supports scoped totals.

### Empty states

| Case | Copy source |
|------|-------------|
| Active connection, zero threads | `resolveConnectionScopeEmptyState('active_no_conversations')` |
| Active connection, zero leads | `active_no_leads` |
| Disconnected hidden | `disconnected_hidden` |

---

## Badge taxonomy (do not merge)

| Layer | Example |
|-------|---------|
| Channel type | Facebook / LINE / Instagram (type family) |
| Lead source | Facebook · Comment / DM / Private Reply |
| Connection | Acme Retail Page (specific Page/OA name) |

---

## Test matrix (implemented in prep)

| ID | Test file | Status |
|----|-----------|--------|
| CCW-S1 prep | active default query | Model test |
| CCW-S2 prep | admin toggle -> all | Model test |
| CCW-S3 prep | sales no override | Model test |
| CCW-S4 prep | unknown label fallback | Model test |
| CCW-S5 prep | no provider id in label component | Prep test |
| CCW-S6 | integration | Blocked until CCW-1A + wire-up |
| Dashboard not wired | prep guard test | Prep test |

---

## Integration checklist (CCW-1B implementation PR)

1. Merge CCW-1A API to master.
2. Rebase `feature/ccw-1b-channel-connection-scope-ui`.
3. Wire `ChannelConnectionScopeToggle` into inbox filter drawer.
4. Wire `ChannelConnectionLabel` into inbox row, context panel, leads table.
5. Pass `role` into `buildLeadsListUrl`.
6. Work Queue: conditional label vs fallback helper.
7. Analytics: scope banner.
8. E2E: CCW-S1 through CCW-S10 from CCW-0 audit.
9. Update smoke inventory.

---

## Out of scope

- Facebook profile image / display name enrichment
- `DB_ONLY`, resolver flag, Marketplace, CDP
- Backend classification or list filtering in UI
- Merging before CCW-1A
