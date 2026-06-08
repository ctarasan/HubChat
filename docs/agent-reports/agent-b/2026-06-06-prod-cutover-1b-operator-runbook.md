# Agent B — PROD-CUTOVER-1B Operator Runbook

## Status
**Complete** — operator runbook + production cutover checklist (docs only).

## Metadata
- Agent: B
- Date: 2026-06-06
- Branch: `docs/prod-cutover-1b-operator-runbook`
- Base: `master` @ `602feb321d1c1b6302e62297eb830de7f2795b04`

## Files changed

| File | Change |
|------|--------|
| `docs/prod-cutover-1b-operator-runbook.md` | **New** — FB Page onboarding, troubleshooting, IG avatar, cutover checklist |
| `docs/hubchat-smoke-test-inventory.md` | PROD-CUTOVER-1B inventory entry |
| `docs/agent-reports/agent-b/2026-06-06-prod-cutover-1b-operator-runbook.md` | This report |
| `docs/agent-reports/agent-b/latest.md` | Index update |

## Scope confirmation

Docs-only. No backend/API/DB/worker/UI/E2E/migrations/package changes. No secrets. No resolver flag or permanent DB_ONLY enablement.

## Verification

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| Hidden/bidi scan | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |

## Next recommendation

Ops: use runbook §1 before connecting a new customer Facebook Page; complete §4 before cutover GO.
