# PL-NAV-1 — Pipeline Open Inbox Deep-Link Focus

- Date: 2026-06-12
- Agent: B
- Branch: `feature/pl-nav-1-pipeline-inbox-deep-link`
- Status: Implemented

## Problem

Clicking `Open inbox` from a Pipeline (Leads) lead navigated to `/dashboard?conversationId=<id>`,
but the Dashboard ignored the query parameter and selected the first inbox lead instead of the
clicked conversation.

## What was already in place

- The Pipeline side was already correct: `buildDashboardConversationHref` (`src/ui/leadsPageModel.ts`)
  emits `/dashboard?conversationId=<conversation-id>` from the lead row's stable `conversationId`
  (which is the conversation UUID from `LeadsListItemDto`). No name/position-based targeting exists.
- The gap was entirely on the Inbox side: `DashboardPage` never read URL query parameters.

## Implementation

### API change (required: yes, minimal)

There was no conversation-by-ID read endpoint, so the deep link could not resolve a target outside
the first loaded page (25 rows) or hidden by current filters. Added:

- `GET /api/conversations/[id]` (`app/api/conversations/[id]/route.ts`)
  - Same role gate as the list (`SALES`, `MANAGER`, `ADMIN`), tenant-scoped lookup.
  - SALES mirrors the list's forced `mine` scope: a conversation not assigned to the caller
    returns 404 (no access broadening; 404 for both missing and inaccessible, so the response
    does not reveal existence).
  - Reuses the exact list pipeline: `filterOwnPlatformAccountConversations`,
    `applyConnectionScopeToListRows`, source-post metadata bridge, and
    `toConversationListItemDto` — the response is one item in the identical list DTO shape.
  - Malformed (non-UUID) id → 400 before any repository call.
- `findInboxListItemById` on `SupabaseConversationRepository` (optional method on the
  `ConversationRepository` port): single row with the same `CONVERSATION_LIST_SELECT` columns
  as the list query.

### Inbox deep-link handling (`src/ui/DashboardPage.tsx`)

- New module `src/ui/dashboardConversationDeepLink.ts`:
  - `readDashboardConversationDeepLink(search)` — strict UUID validation; malformed values are
    ignored (normal dashboard behavior).
  - `stripDashboardConversationDeepLink(pathname, search)` — removes only the consumed param.
  - `mergeConversationRowsWithDeepLinkRow(rows, row)` — appends an off-page row without reordering.
- `DashboardPage`:
  - Reads the target once on mount into `pendingDeepLinkConversationIdRef`.
  - On the first full list load, the target seeds `previousSelectedId` for
    `resolveInboxSelectionAfterListRefresh`, so an on-page target is selected and its messages
    load through the existing lifecycle (header, messages, context panel all follow
    `selectedConversationId` as before).
  - Off-page target: fetched via `GET /api/conversations/[id]`, mapped with
    `mapApiConversationRow`, and appended to the list. The injected row is kept across silent
    list refreshes while it remains selected (poll refreshes no longer bounce selection).
  - Not-found/forbidden/error: safe notice "The conversation from this link was not found or is
    not accessible." and the inbox falls back to default selection. The by-id fetch is fail-open.
  - After the target is applied, `history.replaceState` removes the param (no new history entry,
    so browser Back still returns to the Pipeline page).
  - The selected row scrolls into view via `data-lead-key` on the inbox list rows.
  - No `conversationId` param → ordinary `/dashboard` behavior is unchanged.

## Edge cases

| Case | Behavior |
| --- | --- |
| Target not in first 25 rows | Fetched by id, appended, selected |
| Hidden by current inbox filters | Same by-id path; filters unchanged for the rest of the list |
| Team Inbox vs My Inbox | Selection is by conversation id; MANAGER/ADMIN see tenant-wide |
| Inaccessible under role/scope | 404 from API → safe notice, default selection |
| Deleted / nonexistent | 404 from API → safe notice, default selection |
| Malformed query param | Rejected at parse; treated as no deep link |

## Tests

- `src/ui/dashboardConversationDeepLink.test.ts` — param parsing (valid/missing/malformed,
  name-based params ignored), URL stripping, row merging.
- `src/interfaces/api/conversationById.route.test.ts` — 200 list-shaped DTO + key allowlist,
  404 missing, 400 malformed, SALES own/other/unassigned scoping, self-filter 404, 401, fail-safe
  404 when the repo method is absent, no secret/token leakage.
- `src/infrastructure/adapters/repositories/supabaseConversationRepository.test.ts` — new method
  uses inbox list columns with tenant + id filters; null when absent.
- `src/ui/dashboardConversationDeepLinkUi.test.ts` — Dashboard integration markers (read, seed,
  by-id fetch, safe failure copy, replaceState cleanup, scroll) and Pipeline href contract.

## Verification

- `npm test`: 1896/1896 pass
- `npm run typecheck`: clean
- `npm run lint` (typegen + tsc): clean
- `npm run build`: success
