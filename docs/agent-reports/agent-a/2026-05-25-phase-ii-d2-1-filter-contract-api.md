# Agent Report

## Metadata

- Agent: A
- Date: 2026-05-25
- Phase / Task: Phase II-D2.1 - Filter contract API hardening
- Branch: `feature/phase-ii-d2-1-filter-contract-api`
- Base commit: `d57ede9`
- Head commit: `d302326`
- PR: **#71**
- Status: Complete / Ready for review

## Goal

Audit and harden `GET /api/conversations` filter contract for Dashboard Manager UX after PR #69 merge, without UI changes.

## Scope

- In scope: query parsing, scope rules, inbox filter SQL steps, `pageInfo.hasNextPage`, route/repository tests, agent reports
- Out of scope: Dashboard UI, CSS, E2E, worker, channel adapters, runtime config, DB_ONLY, migrations, packages

## Frozen API contract (GET /api/conversations)

| Query param | Values |
|-------------|--------|
| `scope` | `mine` \| `team` \| `unassigned` \| `all` |
| `channel` | `LINE` \| `FACEBOOK` \| `INSTAGRAM` |
| `conversationStatus` | `OPEN` \| `PENDING` \| `RESOLVED` |
| `leadManagementStatus` | `NEW` \| `IN_PROGRESS` \| `FOLLOW_UP` \| `WON` \| `LOST` \| `CLOSED` |
| `followUp` | `all` \| `scheduled` \| `today` \| `overdue` \| `none` |
| `sla` | `all` \| `active` \| `due_soon` \| `overdue` \| `none` |
| `waiting` | `all` \| `needs_response` \| `waiting_customer` |
| `assignedAgentId` | sales agent UUID |
| `cursor` | opaque cursor |
| `limit` | number |

Response:

```json
{
  "data": "ConversationListItem[]",
  "pageInfo": { "nextCursor": "string | null", "hasNextPage": "boolean" }
}
```

### Legacy aliases (backward compatible until Agent B migrates UI)

| Legacy | Maps to |
|--------|---------|
| `scope=assigned_to_me` | `mine` |
| `status` | `conversationStatus` |
| `leadStatus` | `leadManagementStatus` (ASSIGNED/CONTACTED/QUALIFIED -> IN_PROGRESS) |
| `followUp=has` | `scheduled` |
| `sla=has` | `active` |
| `assignedSalesId` | `assignedAgentId` |

`status=CLOSED` and `status=ARCHIVED` still accepted for existing Dashboard queries.

## Files Changed

| File | Change |
|------|--------|
| `app/api/conversations/route.ts` | Central query parse; `hasNextPage`; frozen param wiring |
| `src/interfaces/api/conversationListInboxFilters.ts` | Frozen contract schema, parsers, SQL steps (lead mgmt, waiting, none) |
| `src/interfaces/api/conversationListInboxFilters.test.ts` | Contract + alias + SQL step tests |
| `src/interfaces/api/conversationListScope.ts` | `mine` / `team` scope; SALES forbidden on team/all/unassigned |
| `src/interfaces/api/conversationListScope.test.ts` | Scope resolution tests |
| `src/interfaces/api/conversations.route.test.ts` | Route contract + legacy alias tests |
| `src/domain/ports.ts` | `team` assignment filter; `assignedAgentId` |
| `src/infrastructure/adapters/repositories/supabaseConversationRepository.ts` | Team scope + waiting filters |
| `src/infrastructure/adapters/repositories/supabaseConversationRepository.test.ts` | List filter integration test |
| `docs/agent-reports/agent-a/latest.md` | This phase handoff |
| `docs/agent-reports/agent-a/2026-05-25-phase-ii-d2-1-filter-contract-api.md` | Historical copy |

## Behavior Summary

- **Scope:** MANAGER/ADMIN `team` = assigned conversations only; `mine` = current user's agent id; SALES always scoped to self.
- **Lead management filter:** Maps to `leads.status` and/or `follow_up_at` (e.g. IN_PROGRESS = in-funnel statuses without follow-up; FOLLOW_UP = follow-up scheduled).
- **Waiting filter:** Server-side compare `last_customer_message_at` vs `last_agent_message_at`.
- **Pagination:** `hasNextPage` derived from `nextCursor != null`.
- **Sentinels:** `followUp=all` / `sla=all` omit repository filter steps; `followUp=none` / `sla=none` apply `IS NULL` on `follow_up_at` / `sla_due_at`.

## Verification

| Check | Result |
|-------|--------|
| git diff --check | PASS |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm test | PASS |
| npm run build | PASS |

## Guardrails Confirmation

- No UI/CSS/E2E edits
- No worker, webhooks, adapters, runtime, migrations, packages
- No secrets in reports
- `LATEST.md` not edited (Agent A protocol)

## Known Issues / Notes

- `waiting` filter uses PostgREST `or()` on timestamp columns; requires maintained `last_customer_message_at` / `last_agent_message_at`.
- `followUp=none` and `sla=none` are accepted at API layer; Dashboard UI may adopt in Agent B phase.
- Current Dashboard still sends legacy query params; aliases preserve behavior until UI rebase.

## Agent B readiness

**Safe to rebase/merge UI after this PR:** Yes. Backend accepts both frozen and legacy query params. Agent B should switch to frozen names (`scope=mine|team`, `conversationStatus`, `leadManagementStatus`, `followUp=scheduled`, `sla=active`, `assignedAgentId`) and read `pageInfo.hasNextPage` for pagination UX.

## Next Recommended Step

1. Merge PR **#71** after review.
2. Agent B: Dashboard filter bar + query suffix migration on top of master.
