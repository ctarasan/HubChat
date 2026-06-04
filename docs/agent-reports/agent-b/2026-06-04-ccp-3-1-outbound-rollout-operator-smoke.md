# Agent B — CCP-3.1 Outbound Rollout Operator Smoke

## Status
**Complete** — operator smoke checklist and production evidence template (docs only).

## Metadata
- Agent: B
- Date: 2026-06-04
- Branch: `docs/ccp-3-1-outbound-rollout-operator-smoke`
- PR target: docs-only merge to `master`

## Files changed

| File | Change |
|------|--------|
| `docs/channel-connect-outbound-rollout-operator-smoke.md` | **New** — operator smoke checklist, evidence tables, log checks, rollback, GO/NO-GO |
| `docs/hubchat-smoke-test-inventory.md` | Inventory entry for CCP-3.1 manual rollout smoke |
| `docs/agent-reports/agent-b/2026-06-04-ccp-3-1-outbound-rollout-operator-smoke.md` | This report |
| `docs/agent-reports/agent-b/latest.md` | Index update |

## Summary

Added operator-facing documentation for controlled production rollout of the CCP-3 Channel Connect outbound resolver:

- Pre-rollout safety checks (flag off, commit alignment, ops baseline)
- Per-provider smokes: LINE, Facebook (Messenger DM + comment-origin), Instagram (DM, image, comment private reply)
- Flag-off baseline required before any flag-on pilot
- Evidence capture template (metadata only, no secrets)
- Safe vs red-flag log patterns
- Rollback steps (`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false`, restart worker, re-test legacy, preserve DB rows)
- Final GO/NO-GO criteria with explicit **no `DB_ONLY`** rollout smoke

## Scope confirmation

| Area | Touched? |
|------|----------|
| Runtime / worker / API / UI | **No** |
| Env vars (Vercel/Railway) | **No** |
| Credential migration | **No** |
| Real tokens/secrets in docs | **No** |
| `DB_ONLY` rollout | **No** |
| Inbound webhooks | **No** |
| Channel Settings UI/API | **No** |
| Setup Wizard / OAuth / marketplace | **No** |
| `package.json` | **No** |

## Production safety confirmation

- Checklist assumes **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` remains off** until Agent A runbook + operator baseline smokes pass.
- Does not instruct operators to enable the flag without controlled window and evidence.
- Explicitly excludes `DB_ONLY` from rollout smoke scope.
- Rollback preserves `channel_connections` / `channel_credentials` data.

## Verification results

| Check | Result |
|-------|--------|
| `git diff --check` | PASS (docs only) |
| Hidden/bidi Unicode scan | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |

## Next recommendation

1. **Agent A** — Publish/finalize technical rollout-readiness and credential migration runbook; cross-link from `docs/channel-connect-outbound-rollout-operator-smoke.md`.
2. **Ops** — Run **flag-off baseline** smokes using this checklist before any Railway env change.
3. **After pilot GO** — CCP-4+ (UI/wizard) remains separate; marketplace still paused.
