# Agent A Report — CCP-3.3-A LINE Outbound Resolver Pilot Readiness

**Date:** 2026-06-04
**Branch:** `feature/ccp-3-3-a-line-outbound-resolver-pilot-readiness`
**Scope:** LINE-only secure ops wrapper for CCP-3.2-A credential migration helper

## Summary

Added a dry-run-first **LINE pilot** for outbound credential migration readiness:

- Application wrapper: `prepareLineOutboundCredentialMigrationPilot`
- Ops script: `scripts/ops/prepare-line-outbound-credential-migration.mjs`
- Credentials read from **environment only** (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`)
- Execute gated by `--execute` + `--dry-run=false` + Supabase repository + non-placeholder credentials

## Files changed

| File | Purpose |
|------|---------|
| `src/application/channelConnect/prepareLineOutboundCredentialMigrationPilot.ts` | LINE-only pilot wrapper |
| `src/application/channelConnect/prepareLineOutboundCredentialMigrationPilot.test.ts` | 12 unit tests |
| `scripts/ops/prepare-line-outbound-credential-migration.mjs` | Operator CLI (tsx) |
| `docs/agent-reports/agent-a/2026-06-04-ccp-3-3-a-line-outbound-resolver-pilot-readiness.md` | This report |
| `docs/agent-reports/agent-a/latest.md` | Index |

## Helper behavior

**Default:** dry-run — validates tenant, LINE account/page id, `ACCESS_TOKEN` + `CHANNEL_SECRET` plan states, no DB writes.

**Execute:** uses `prepareOutboundCredentialMigration` + `SupabaseChannelConnectionRepository` only when explicitly requested; returns fingerprints only, never plaintext.

**Output:** JSON with `WOULD_SET` / `MISSING` / `INVALID` / `STORED`, env presence flags, warnings, errors, `nextSteps`.

## Dry-run default confirmation

Yes — CLI and API default to dry-run; execute requires `--execute --dry-run=false`.

## Execute path status

**Included** — repository-injected via script when `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and encryption key are configured. Not invoked from worker/webhooks.

## Production safety

- Does not set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`
- No worker/webhook/send path imports
- No `DB_ONLY` guidance added
- No real secrets in repo

## Verification

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (1678/1678) |
| `npm run build` | PASS |

## Next recommended phase

**CCP-3.3-B** — Ops runbook section linking this script to evidence pack §3, or **CCP-4** inbound webhook integration.

---

Prior: [CCP-3.2-A migration helper](./2026-06-04-ccp-3-2-secure-credential-migration-helper.md) · [Rollout evidence pack](../agent-b/2026-06-04-ccp-3-2-outbound-rollout-evidence-pack.md)
