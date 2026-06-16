# Agent B Report — FB-OAUTH-1F Facebook OAuth Staging / Pilot Smoke Runbook

## Metadata

| Field | Value |
|---|---|
| Agent | B |
| Date | 2026-06-15 |
| Phase | FB-OAUTH-1F — Staging/pilot smoke and rollback runbook (docs only) |
| Branch | `docs/fb-oauth-1f-staging-pilot-smoke-runbook` |
| Base | `master` @ FB-OAUTH-1C merged (`cd2af22`) |
| Contracts | [FB-OAUTH-1A](../agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md), [FB-OAUTH-1C](../agent-a/2026-06-15-fb-oauth-1c-runtime-health-reconnect.md), [FB-OAUTH-1D UI](./2026-06-15-fb-oauth-1d-ui-discovery-spec.md) |

---

## Summary

Operator-ready staging/pilot smoke and rollback runbook for Facebook OAuth assisted connection. Separates checks available on current `master` (PRs #222–#226) from those requiring **FB-OAUTH-1E** (worker outbound), Meta configuration/App Review, and production feature-flag enablement.

**Production rollout is not complete.** Runbook does not authorize broad production OAuth enablement.

---

## Files changed

| File | Change |
|------|--------|
| `docs/hubchat-facebook-oauth-staging-pilot-smoke-runbook.md` | **New** — operator runbook |
| `docs/hubchat-smoke-test-inventory.md` | FB-OAUTH-1F inventory entry |
| `docs/agent-reports/agent-b/2026-06-15-fb-oauth-1f-staging-pilot-smoke-runbook.md` | This report |
| `docs/agent-reports/agent-b/latest.md` | Index update |

---

## Runbook structure

1. Capability matrix (now vs 1E vs Meta vs flags)  
2. Preconditions (deploy, migration, Meta, flags, pilot tenant/Page, rollback owner)  
3. Safe enablement order (staging first, single tenant)  
4. OAuth flow smoke (connect → callback → pages → complete → health → CONNECTED)  
5. Reconnect smoke  
6. Outbound smoke (**gated on FB-OAUTH-1E**)  
7. Manual Facebook regression  
8. LINE/Instagram regression  
9. Security checks  
10. Expected display-state transitions  
11. Rollback (flags, manual fallback, credential retention)  
12. Evidence capture + stop conditions  

---

## Assumptions dependent on FB-OAUTH-1E

| Topic | Assumption |
|-------|------------|
| Worker outbound | Section 5 skipped until 1E merges; `RUNTIME_TEST_CONNECTION` on `master` proves Test Connection path only |
| Outbound false DONE | Stop condition applies after 1E outbound smoke |
| Rollback RB9–RB11 | Relevant only after 1E deployment |
| Inbound Graph tenant token | **Not** in 1E scope per Agent A 1C deferral — remains env/manual policy |

---

## Rollout gates (from runbook)

1. Staging + migrations + Meta staging app  
2. `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (pilot)  
3. `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` (pilot)  
4. OAuth + reconnect + security smoke PASS  
5. Manual + LINE/IG regression PASS  
6. FB-OAUTH-1E → outbound smoke PASS  
7. Single production pilot tenant — release owner sign-off  

---

## Rollback summary

- Disable `HUBCHAT_FACEBOOK_OAUTH_ENABLED` first  
- Disable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` if pilot enabled it  
- Preserve manual Channel Settings and **do not** bulk-delete OAuth credentials on immediate rollback  
- Credential cleanup only with release-owner approval after manual fallback verified  

---

## Scope confirmation

Docs-only. No runtime, UI, migration, package, or E2E code changes.

---

## Verification

| Check | Result |
|-------|--------|
| `git diff --check` | Run at commit time |
| Hidden/bidi scan | Operator should run on commit |

---

## Prior

FB-OAUTH-1D UI spec ([#223](https://github.com/ctarasan/HubChat/pull/223), [#224](https://github.com/ctarasan/HubChat/pull/224)); FB-OAUTH-1C review ([#226](https://github.com/ctarasan/HubChat/pull/226)); PROD-CUTOVER-1B runbook.
