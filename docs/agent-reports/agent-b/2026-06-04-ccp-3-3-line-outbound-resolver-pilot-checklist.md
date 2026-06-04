# Agent B — CCP-3.3-B LINE Outbound Resolver Pilot Checklist

## Status
**Complete** — LINE-only operator pilot checklist (docs only).

## Metadata
- Agent: B
- Date: 2026-06-04
- Branch: `docs/ccp-3-3-b-line-outbound-resolver-pilot-checklist`

## Files changed

| File | Change |
|------|--------|
| `docs/channel-connect-line-outbound-resolver-pilot-checklist.md` | **New** — LINE pilot preflight, credential prep, flag-on, smoke, rollback, GO/NO-GO, evidence table |
| `docs/hubchat-smoke-test-inventory.md` | CCP-3.3-B inventory entry |
| `docs/agent-reports/agent-b/2026-06-04-ccp-3-3-line-outbound-resolver-pilot-checklist.md` | This report |
| `docs/agent-reports/agent-b/latest.md` | Index update |

## Summary

Operator checklist for a **future** controlled LINE outbound resolver pilot using `DB_WITH_ENV_FALLBACK` and temporary `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true`. Explicitly states pilot has not run yet; forbids `DB_ONLY` and secret paste; includes preflight, credential dry-run/execute discipline, flag-on steps, LINE smoke, rollback, GO/NO-GO, and evidence table.

## Scope confirmation

Docs-only. No runtime, env, migration execute, UI, marketplace, or secrets.

## Production safety

- Flag remains off until scheduled window.
- Rollback preserves DB credentials.
- Cross-links to CCP-3.1/3.2 docs; Agent A CCP-3.3-A referenced as companion (not edited).

## Verification results

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| Hidden/bidi scan | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |

## Next recommendation

1. **Agent A** — Merge CCP-3.3-A LINE readiness wrapper; link from checklist § Related docs.
2. **Ops** — Run §1 preflight only while flag off; archive evidence folder before any window.
3. After LINE GO — plan Facebook/Instagram pilots separately (not this PR).
