# Agent A Report — CCP-3.2-A Secure Credential Migration Helper

**Date:** 2026-06-04  
**Branch:** `feature/ccp-3-2-secure-credential-migration-helper`  
**Scope:** Dry-run-first migration planner + optional execute path for CCP-1 outbound credentials

## Summary

Added `prepareOutboundCredentialMigration` — a secure application helper to **plan and validate** outbound credential migration into `channel_connections` / `channel_credentials` for LINE, FACEBOOK, and INSTAGRAM. **Dry-run is the default** (no DB writes). An explicit **execute** path uses CCP-1 `storeEncryptedCredential` via injected repository only when `execute=true` and `dryRun=false`.

## Files changed

| File | Purpose |
|------|---------|
| `src/lib/outboundCredentialMigrationValidation.ts` | Provider validation, placeholder detection, safe payload guard |
| `src/application/channelConnect/prepareOutboundCredentialMigration.ts` | Migration planner + optional execute |
| `src/application/channelConnect/prepareOutboundCredentialMigration.test.ts` | Unit tests (13 cases) |
| `docs/agent-reports/agent-a/2026-06-04-ccp-3-2-secure-credential-migration-helper.md` | This report |
| `docs/agent-reports/agent-a/latest.md` | Index |

No worker, webhook, Channel Settings, UI, HTTP API, env, or marketplace changes. No `package.json` changes.

## Helper behavior

**Input:** `tenantId`, `provider`, account/page IDs, credential fields (`channelAccessToken`, `channelSecret`, `pageAccessToken`, `accessToken`), optional `displayName`, `dryRun` (default true), `execute`.

**Dry-run output (safe):** `mode: dry_run`, `valid`, proposed `READY` status, account field presence flags, per-type `WOULD_SET` / `MISSING` / `INVALID`, `warnings`, `errors`, `nextSteps`. No secrets, fingerprints only on execute.

**Execute path:** **Included** — requires `execute=true` + `dryRun=false` + valid plan + repository; rejects angle-bracket placeholders; stores via `storeEncryptedCredential`; returns `connectionId` + `secretFingerprint` metadata only.

## Dry-run default confirmation

- Default `dryRun` behavior: no repository calls unless `execute=true` and `dryRun=false`
- `execute=true` with default `dryRun` produces dry-run + warning

## Execute path status

**Included** (small, repository-injected, unit-tested with fake credentials). Not wired to worker or any automatic production path.

## Production safety

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unchanged
- Worker outbound, webhooks, runtime modes unchanged
- No real credentials in repo
- No `DB_ONLY` rollout

## Verification

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (1666/1666) |
| `npm run build` | PASS |

## Next recommended phase

**CCP-3.2-B** — Optional CLI or one-off admin script wrapping `prepareOutboundCredentialMigration` for ops (stdin/env excluded from git), **or** **CCP-4** inbound webhook integration per rollout plan.

---

Prior: [CCP-3.1 rollout readiness](./2026-06-04-ccp-3-1-outbound-rollout-readiness.md)
