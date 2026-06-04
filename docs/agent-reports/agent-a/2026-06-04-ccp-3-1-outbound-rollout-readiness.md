# Agent A Report — CCP-3.1 Outbound Rollout Readiness

**Date:** 2026-06-04  
**Branch:** `docs/ccp-3-1-outbound-rollout-readiness`  
**Type:** Documentation only (rollout plan / runbook)

## Summary

Added a production-safe **outbound rollout readiness runbook** for migrating LINE / Facebook / Instagram worker credentials from legacy ENV and `channel_settings` into CCP-1 `channel_connections` / `channel_credentials`, then enabling CCP-3 under `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` with per-provider `DB_WITH_ENV_FALLBACK` during controlled smoke windows.

## Files changed

| File | Purpose |
|------|---------|
| `docs/channel-connect-outbound-rollout-readiness.md` | Ops runbook: prerequisites, env inventory, migration strategy, checklists, smoke tests, observability, rollback, go/no-go |
| `docs/agent-reports/agent-a/2026-06-04-ccp-3-1-outbound-rollout-readiness.md` | This report |
| `docs/agent-reports/agent-a/latest.md` | Index update |

**No application/runtime code changes.** No `package.json` changes. No marketplace files.

## Scope confirmation

- Does **not** enable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` in any environment
- Does **not** migrate real credentials or store secrets in the repo
- Does **not** set `DB_ONLY` or change Vercel/Railway env
- Does **not** alter worker send path, inbound webhooks, Channel Settings UI/API, Setup Wizard, OAuth, or LINE Module Channel

## Production safety confirmation

Runtime behavior is **unchanged** by this PR (documentation only). Production outbound remains **legacy** while the Channel Connect resolver flag stays off.

## Rollout recommendation

1. **Ops / tenant prep:** populate `channel_connections` + encrypted `channel_credentials` per tenant (secure script or SQL with placeholders only).
2. **Baseline smoke:** flag off, all providers.
3. **Pilot one provider:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` + `DB_WITH_ENV_FALLBACK` for that provider only; smoke + log review; rollback drill.
4. **Repeat** for remaining providers; keep legacy ENV/channel_settings until stable.
5. **Defer `DB_ONLY`** to a later phase after consistent `channel_connect_db` resolution without unexpected fallback.

## Verification results

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| Hidden/bidi Unicode scan (changed docs) | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (1654/1654) |
| `npm run build` | PASS |

## Next recommended phase

**CCP-4** — Feature-flagged **inbound** webhook integration (`resolveInboundChannelConnection`, connection-specific routes) with the same flag gating and sanitized diagnostics, **after** outbound pilot proves stable on `DB_WITH_ENV_FALLBACK`.

Alternatively parallel ops track: **secure credential migration script** (server-side, not in git) implementing CCP-1 `storeEncryptedCredential` for bulk tenant prep referenced by this runbook.

---

Prior: [CCP-3 worker integration](./2026-06-04-ccp-3-feature-flagged-worker-outbound-integration.md)
