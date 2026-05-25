# Agent Report

## Metadata

- Agent: A
- Date: 2026-05-25
- Phase / Task: Phase II-D2.1 - Filter contract API hardening
- Branch: `feature/phase-ii-d2-1-filter-contract-api`
- Base commit: `d57ede9`
- Head commit: `c3d1b22`
- PR: **#71**
- Status: Complete / Ready for review

## Goal

Audit and harden `GET /api/conversations` filter contract for Dashboard Manager UX after PR #69 merge.

## Scope

- In scope: query parsing, scope rules, inbox filter SQL steps, `pageInfo.hasNextPage`, route/repository tests
- Out of scope: Dashboard UI, CSS, E2E, worker, channel adapters, runtime config, DB_ONLY, migrations, packages

## Frozen API contract (summary)

| Param | Values |
|-------|--------|
| `scope` | `mine` \| `team` \| `unassigned` \| `all` |
| `channel` | `LINE` \| `FACEBOOK` \| `INSTAGRAM` |
| `conversationStatus` | `OPEN` \| `PENDING` \| `RESOLVED` |
| `leadManagementStatus` | `NEW` \| `IN_PROGRESS` \| `FOLLOW_UP` \| `WON` \| `LOST` \| `CLOSED` |
| `followUp` | `all` \| `scheduled` \| `today` \| `overdue` \| `none` |
| `sla` | `all` \| `active` \| `due_soon` \| `overdue` \| `none` |
| `waiting` | `all` \| `needs_response` \| `waiting_customer` |
| `assignedAgentId` | UUID |

Response: `{ data, pageInfo: { nextCursor, hasNextPage } }`.

### Sentinel semantics (follow-up / SLA)

- `followUp=all` / `sla=all` - no repository filter
- `followUp=none` - `follow_up_at IS NULL`
- `sla=none` - `sla_due_at IS NULL`

Legacy aliases (`assigned_to_me`, `status`, `leadStatus`, `followUp=has`, `sla=has`, `assignedSalesId`) remain until Agent B migrates UI.

## Files Changed

| File | Change |
|------|--------|
| `app/api/conversations/route.ts` | Frozen query parse; `hasNextPage` |
| `src/interfaces/api/conversationListInboxFilters.ts` | Contract schema, parsers, SQL steps |
| `src/interfaces/api/conversationListInboxFilters.test.ts` | Contract + `none` sentinel tests |
| `src/interfaces/api/conversationListScope.ts` | `mine` / `team` scope |
| `src/interfaces/api/conversations.route.test.ts` | Route pass-through tests |
| `src/domain/ports.ts` | `team` assignment filter |
| `src/infrastructure/adapters/repositories/supabaseConversationRepository.ts` | Filter application |
| `src/infrastructure/adapters/repositories/supabaseConversationRepository.test.ts` | `none` IS NULL tests |
| `docs/agent-reports/agent-a/latest.md` | This report |
| `docs/agent-reports/agent-a/2026-05-25-phase-ii-d2-1-filter-contract-api.md` | Historical copy |

## Verification

| Check | Result |
|-------|--------|
| git diff --check | PASS |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm test | PASS |
| npm run build | PASS |

## Guardrails

Backend/API only. No UI, E2E, worker, runtime, migrations, packages. `LATEST.md` and `agent-b/*` not edited.

## Agent B

Safe to rebase UI onto this branch after merge. Use frozen param names and `pageInfo.hasNextPage`.

## Historical

`docs/agent-reports/agent-a/2026-05-25-phase-ii-d2-1-filter-contract-api.md`
