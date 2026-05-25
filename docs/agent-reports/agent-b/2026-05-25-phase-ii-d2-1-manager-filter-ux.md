# Agent Report

## Metadata
- Agent: B
- Date: 2026-05-25
- Phase / Task: Phase II-D2.1 — Manager Filter UX
- Branch: `feature/phase-ii-d2-1-manager-filter-ux`
- Base commit: `d57ede9` (master after PR #69)
- Head commit: `bdd4d44` (amended message on push)
- PR: *(see final handoff)*
- Status: complete

## Goal
Improve Dashboard Manager/Admin/Sales inbox filter UX using the frozen GET `/api/conversations` query contract, in parallel with Agent A backend work.

## Scope
- In scope: Dashboard filter UI, `dashboardInboxFilters` query helpers, unit/data-flow tests, Playwright E2E scaffolding, inbox CSS, Agent B reports.
- Out of scope: API routes, repositories, domain, workers, adapters, runtime config, migrations, packages.

## Files Changed
| File | Change |
|---|---|
| `src/ui/dashboardInboxFilters.ts` | Frozen contract query builders, unified filter state, badges, action presets |
| `src/ui/dashboardInboxFilters.test.ts` | Contract query generation tests |
| `src/ui/DashboardPage.tsx` | Filter panel, `inboxFilters` + refs for load more / silent poll |
| `src/ui/dashboardDataFlow.test.ts` | D2.1 + PR #68/#69 regression asserts |
| `src/ui/teamInboxDashboardHelpers.ts` | Removed legacy `status`/`scope` query helpers (moved to inbox filters) |
| `src/ui/teamInboxDashboardHelpers.test.ts` | Dropped obsolete scope/status tests |
| `app/globals.css` | Active filter badges + clear-all row |
| `tests/e2e/dashboard-filters.spec.ts` | Manager filter panel E2E |
| `tests/e2e/dashboard-smoke.spec.ts` | Filter panel visibility for manager/admin |

## Behavior Summary
- **Scope** (Manager/Admin): My inbox (`mine`), Team inbox (`team`), Unassigned, All.
- **Channel**: LINE, Facebook, Instagram.
- **Conversation status**: Open, Pending, Resolved.
- **Lead management status** (list filter): New, In progress, Follow-up, Won, Lost, Closed.
- **Action filters**: Needs response, SLA overdue/due soon, Follow-up today/overdue.
- **Active badges** + **Clear all**; filter change reloads list; load more and silent refresh preserve filters via `inboxFiltersRef`.
- **SALES**: `scope=mine` only; team/all/unassigned controls hidden.
- **PR #68**: Per-conversation lead status select + PATCH unchanged.
- **PR #69**: Instagram image composer paths unchanged (data-flow asserts).

## Frozen API contract used
```
GET /api/conversations?limit=N
  &scope=mine|team|unassigned|all
  &channel=LINE|FACEBOOK|INSTAGRAM
  &conversationStatus=OPEN|PENDING|RESOLVED
  &leadManagementStatus=NEW|IN_PROGRESS|FOLLOW_UP|WON|LOST|CLOSED
  &followUp=all|scheduled|today|overdue|none
  &sla=all|active|due_soon|overdue|none
  &waiting=all|needs_response|waiting_customer
  &assignedAgentId=<sales_agent_id>
  &cursor=<cursor>
```

## Verification
| Check | Result |
|---|---|
| git diff --check | pass |
| npm run typecheck | pass |
| npm run lint | pass |
| npm test | pass (856) |
| npm run build | pass |
| E2E / smoke | not run — `E2E_BASE_URL` not set |

## Guardrails confirmed
- No backend/API/domain/repository/worker/adapter/runtime/migration/package changes.
- No secrets or raw env values in code or reports.
- Did not edit `docs/agent-reports/agent-a/*` or `LATEST.md`.

## Known notes
- Full E2E against live filtered list API requires Agent A D2.1 backend merge/deploy.
- `teamInboxDashboardHelpers.ts` touched only to remove duplicate legacy query param builders now owned by `dashboardInboxFilters.ts`.

## Rebase after Agent A
Rebase onto `origin/master` after Agent A merges D2.1 API if shared types or param names change; UI should remain compatible if frozen contract is stable.

## Next action
Merge after Agent A API PR or rebase if needed; run staging E2E with manager credentials once backend accepts new query params.
