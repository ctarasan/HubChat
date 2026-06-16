# Agent B Report — FB-OAUTH-1F Facebook OAuth Staging / Pilot Smoke Runbook

## Metadata

| Field | Value |
|---|---|
| Agent | B |
| Date | 2026-06-15 (reconciled 2026-06-16 after PR #228 merge) |
| Phase | FB-OAUTH-1F — Staging/pilot smoke and rollback runbook (docs only) |
| Branch | `docs/fb-oauth-1f-staging-pilot-smoke-runbook` |
| Base | `master` including FB-OAUTH-1E merged ([#228](https://github.com/ctarasan/HubChat/pull/228)) |
| PR | [#227](https://github.com/ctarasan/HubChat/pull/227) |
| Contracts | [FB-OAUTH-1A](../agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md), [FB-OAUTH-1C](../agent-a/2026-06-15-fb-oauth-1c-runtime-health-reconnect.md), [FB-OAUTH-1E](../agent-a/2026-06-16-fb-oauth-1e-worker-outbound-credential.md), [FB-OAUTH-1D UI](./2026-06-15-fb-oauth-1d-ui-discovery-spec.md) |

---

## Summary

Operator-ready staging/pilot smoke and rollback runbook for Facebook OAuth assisted connection through worker outbound. Reconciled after **PR #228 (FB-OAUTH-1E)** merged into `master`.

**Production rollout is not complete.** Runbook does not authorize broad production OAuth enablement.

**This PR is docs-only** — no runtime, UI, test, migration, package, or environment file changes.

---

## Prerequisite merged

| PR | Phase | Status |
|----|-------|--------|
| [#228](https://github.com/ctarasan/HubChat/pull/228) | FB-OAUTH-1E worker outbound credential | **Merged** |

---

## Worker outbound path (documented)

```
Queue (token-free) → OutboundWorker → SendOutboundMessageUseCase
  → conversation lookup → Facebook outbound adapter resolver
  → resolveFacebookWorkerOutboundConfig → resolveOutboundChannelCredential
  → encrypted channel_credentials → Facebook Graph send
  → existing delivery/retry/idempotency handling
```

- Credential resolves at worker execution time; retries re-resolve.
- No token in queue, outbox, message metadata, activity metadata, or browser DTOs.
- Credential failure before Graph send; resolver failure cannot falsely mark DONE.

---

## OAuth outbound credential rules

**OAuth-managed connection:**

- Credential from encrypted `channel_credentials` only.
- Connection must be `READY` (all five FB-OAUTH-1C checks PASS).
- Conversation `providerPageId` must match OAuth Page.
- Invalid/missing/revoked/mismatched credentials block outbound.
- No manual/env fallback while resolver enabled and connection is OAuth-managed.

**No OAuth-managed connection:**

- Manual Channel Settings and env fallback per existing rollout rules.

---

## READY and five-check gate

Outbound allowed only when `connectionStatus: READY` after:

`CREDENTIAL_RESOLUTION`, `PAGE_ACCESS`, `REQUIRED_TASKS`, `GRAPH_API`, `RUNTIME_TEST_CONNECTION` — all PASS.

Smoke asserts outbound must not send while `AUTHORIZING`, `RECONNECT_REQUIRED`, `REVOKED`, `ERROR`, or otherwise not outbound-ready.

---

## Page-binding requirement

- Conversation `providerPageId` must match OAuth connection Page.
- Message must appear on intended Facebook Page only.
- Page mismatch must block send; worker must not route by tenant alone.
- Stop if outbound succeeds via different manual/env Page.

---

## Feature flags (environment-wide)

- `HUBCHAT_FACEBOOK_OAUTH_ENABLED` — environment-wide.
- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` — environment-wide.
- “Pilot only” = isolated deploy + one pilot tenant/Page operationally — **not** per-tenant flag gating.

---

## Safe rollback sequence

1. Stop/pause Facebook outbound where possible.
2. Disable `HUBCHAT_FACEBOOK_OAUTH_ENABLED` first.
3. **Do not** disable resolver alone for active OAuth-managed tenant.
4. Verify manual Page ID + token belong to same intended Page before legacy path.
5. Retain OAuth credentials; disable resolver only after legacy validated or outbound stopped.
6. Verify post-rollback sends and queued retries.
7. Record owner, timestamp, SHA, Page id.
8. Revert #228 restores pre-1E silent-fallback risk.

**Resolver-off alone is NOT safe rollback for OAuth-managed tenants.**

---

## Remaining production gates

1. Staging smoke PASS (OAuth, reconnect, outbound, security, manual/LINE/IG).
2. Connection `READY` + Page-binding verified on staging.
3. Rollback drill documented.
4. Production pilot on isolated deploy — single tenant/Page.
5. Release owner sign-off — **not** broad production enablement.

---

## Files changed

| File | Change |
|------|--------|
| `docs/hubchat-facebook-oauth-staging-pilot-smoke-runbook.md` | Reconciled with #228 outbound path, READY gate, Page binding, flags, rollback |
| `docs/hubchat-smoke-test-inventory.md` | FB-OAUTH-1F entry updated |
| `docs/agent-reports/agent-b/2026-06-15-fb-oauth-1f-staging-pilot-smoke-runbook.md` | This report |
| `docs/agent-reports/agent-b/latest.md` | Index update |

---

## Scope confirmation

Docs-only. No runtime, UI, migration, package, or E2E code changes.

---

## Prior

FB-OAUTH-1D UI ([#224](https://github.com/ctarasan/HubChat/pull/224)); FB-OAUTH-1C ([#226](https://github.com/ctarasan/HubChat/pull/226)); FB-OAUTH-1E review PASS ([#228](https://github.com/ctarasan/HubChat/pull/228)); PROD-CUTOVER-1B runbook.
