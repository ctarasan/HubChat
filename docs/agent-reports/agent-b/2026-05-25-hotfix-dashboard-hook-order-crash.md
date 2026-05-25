# Agent Report — Hotfix: Dashboard hook order crash

## Metadata
- Agent: B
- Date: 2026-05-25
- Branch: `hotfix/dashboard-hook-order-crash`
- Status: complete

## Problem
Production `/dashboard` showed "This page couldn't load" with React minified error **#310** ("Rendered more hooks than during the previous render.") before `/api/conversations` was called.

## Root cause
PR #70 added `const inboxFilterBadges = useMemo(...)` **after** the unauthenticated early return:

```tsx
if (!session || !hasRequiredSessionConfig(session)) {
  return ( /* Sign in UI */ );
}
// ... hundreds of lines ...
const inboxFilterBadges = useMemo(...); // only runs when session exists
```

First render (no session): fewer hooks. After session loads: one extra `useMemo` → hook count mismatch → crash.

## Fix
Moved `inboxFilterBadges` `useMemo`, `filtersBusy`, `patchInboxFilters`, and `applyInboxActionPreset` above the session guard return (with other hooks).

## Regression test
`dashboardDataFlow.test.ts` — `inboxFilterBadges useMemo` before `Sign in to continue`; no hook calls after sign-in guard in `DashboardPage.tsx`. Marker must not use bare `indexOf('if (!session...')` (matches `useEffect` guards first).

## Verification
| Check | Result |
|---|---|
| git diff --check | pass |
| npm run typecheck | pass |
| npm run lint | pass |
| npm test | 874 pass / 0 fail |
| npm run build | pass |
