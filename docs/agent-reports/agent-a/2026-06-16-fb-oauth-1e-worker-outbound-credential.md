# Agent Report — FB-OAUTH-1E Facebook Worker Outbound OAuth Credential

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-16 |
| Phase | FB-OAUTH-1E — Worker outbound OAuth credential activation |
| Branch | `feature/fb-oauth-1e-worker-outbound-credential` |
| Prerequisites | PR [#225](https://github.com/ctarasan/HubChat/pull/225) (1B), [#224](https://github.com/ctarasan/HubChat/pull/224) (1D UI), [#226](https://github.com/ctarasan/HubChat/pull/226) (1C health/reconnect) |
| Contracts | [FB-OAUTH-1A](./2026-06-13-fb-oauth-1a-discovery-contract.md), [FB-OAUTH-1C](./2026-06-15-fb-oauth-1c-runtime-health-reconnect.md) |

---

## Summary

Activates OAuth-managed Facebook Page credentials for the **worker outbound** path. When an OAuth-managed connection exists, outbound resolves the encrypted Page token from `channel_credentials` at **execution time** and **never silently falls back** to manual `channel_settings` or environment tokens on credential defects.

**Production rollout is not complete.**

---

## Files changed

| Area | Path |
|---|---|
| Outbound resolver | `src/application/channelConnect/channelConnectRuntimeResolver.ts` |
| Worker outbound config | `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` |
| Facebook adapter factory | `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts` |
| Send use case | `src/application/usecases/sendOutboundMessage.ts` |
| Domain input | `src/domain/channelConnectRuntime.ts` (`providerPageId` on outbound resolve input) |
| Tests | `resolveWorkerOutboundWithChannelConnect.test.ts`, `channelConnectRuntimeResolver.test.ts`, `facebookOAuthRoutes.test.ts` (session expiry fix) |

Reuses OAuth detection from `src/application/facebookOAuth/facebookOAuthRuntimeCredential.ts` (`isOAuthManagedFacebookConnection`).

---

## Credential precedence

### Before (FB-OAUTH-1C baseline)

| Condition | Worker Facebook outbound |
|---|---|
| Resolver on + READY connection + DB decrypt OK | `channel_credentials` |
| Connection not READY / decrypt fail / page mismatch | **Silent fallback** to manual/env (`DB_WITH_ENV_FALLBACK`) |
| Resolver off | Legacy manual/env only |

### After (FB-OAUTH-1E)

**A. OAuth-managed Facebook connection** (`providerPageId` + `connectedAt` + credential row):

1. Encrypted Page token from `channel_credentials` only
2. Connection must be in `OUTBOUND_READY` statuses (includes `READY` after health passes)
3. Conversation `providerPageId` must match connection Page
4. On any defect → `ChannelConnectRuntimeResolverError` with `blockLegacyFallback: true` — **no manual/env fallback**

**B. No OAuth-managed connection:**

1. Manual `channel_settings` (unchanged)
2. Environment fallback per rollout mode (unchanged)

LINE and Instagram outbound paths unchanged.

---

## Connection / Page binding

- `SendOutboundMessageUseCase` passes `conversation.providerPageId` to `FacebookOutboundAdapterResolver.resolve(tenantId, { providerPageId })`.
- `resolveOutboundChannelCredential` validates Page binding via `providerPageId` on resolve input.
- Phase 1 model: one Facebook connection per tenant (`findByTenantAndProvider`). Page binding prevents cross-Page sends when conversation metadata disagrees with OAuth connection.
- Historical conversations without Page metadata: existing route selection still requires `providerPageId` for Messenger sends; missing Page returns sanitized failure (unchanged).

---

## Worker resolution timing

- Queue payload (`OutboundMessageRequestedPayload`) contains **no tokens** — unchanged.
- Worker claims job → `SendOutboundMessageUseCase.execute` → loads conversation → resolves adapter **at execution time** → decrypts credential server-side.
- Retries re-resolve on each attempt (no cached decrypted token in job metadata).
- Idempotency and delivery-status semantics unchanged.

---

## Alignment with FB-OAUTH-1C health

| Path | OAuth detection | Credential source |
|---|---|---|
| `RUNTIME_TEST_CONNECTION` (health) | `isOAuthManagedFacebookConnection` | `resolveFacebookRuntimeCredentialForTest` |
| Worker outbound | Same `isOAuthManagedFacebookConnection` | `resolveOutboundChannelCredential` → `channel_credentials` |

After health passes (`READY`), worker uses the same OAuth credential row. Health cannot pass via OAuth while worker silently uses env.

---

## Failure classification

| Failure | OAuth-managed behavior |
|---|---|
| Credential missing / decrypt fail / invalid state | `blockLegacyFallback` error — no env/manual fallback |
| Connection not READY (`AUTHORIZING`, etc.) | `connection_status_invalid` — no fallback |
| Page ID mismatch | `provider_account_mismatch` — no fallback |
| Revoked credential | `credential_state_invalid` — no fallback |
| Temporary Graph send failure | Existing retry/terminal classification (unchanged) |

---

## Security controls

- Token encrypted at rest; decrypt server-side only at worker execution
- No token in queue payload, message metadata, or browser DTOs
- Resolver logs use diagnostic codes only (no token material)
- `blockLegacyFallback` prevents cross-credential routing for OAuth tenants
- No production environment variable changes in this PR

---

## Test evidence

| Suite | Coverage |
|---|---|
| `resolveWorkerOutboundWithChannelConnect.test.ts` | OAuth READY uses DB token; decrypt fail no fallback; AUTHORIZING no fallback; page mismatch |
| `channelConnectRuntimeResolver.test.ts` | OAuth decrypt failure blocks env fallback |
| Full `npm test` | **1993/1993** — LINE / Instagram / existing Facebook outbound regression |

---

## Migration status

No new migration. Uses existing `channel_connections` / `channel_credentials` from CCP + FB-OAUTH-1B.

---

## Deferred scope

- Inbound Graph / webhook token resolver off global env (FB-OAUTH-1C-follow-up / FB-TOKEN)
- Multi-Page-per-tenant connection selection beyond Phase 1 single-connection model

---

## Production rollout gates

**Production rollout is not complete** until PR [#227](https://github.com/ctarasan/HubChat/pull/227) documents the same rollback safeguards in the operator runbook.

1. PR [#226](https://github.com/ctarasan/HubChat/pull/226) (1C) merged and deployed
2. `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` for the pilot tenant (when OAuth UI/flow is intended)
3. **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true`** — required for OAuth pilot; without it, worker outbound does not use channel-connect resolution and may use legacy manual/env credentials instead
4. OAuth connection reaches **`READY`** only after **all five** FB-OAUTH-1C health checks `PASS` (`CREDENTIAL_RESOLUTION`, `PAGE_ACCESS`, `REQUIRED_TASKS`, `GRAPH_API`, `RUNTIME_TEST_CONNECTION`)
5. OAuth worker outbound is permitted only when the connection is `READY` (in `OUTBOUND_READY` statuses)
6. Worker outbound smoke for OAuth tenant
7. Manual Facebook tenant regression

### Feature flags and pilot scoping

Both `HUBCHAT_FACEBOOK_OAUTH_ENABLED` and `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` are **environment-wide** unless deployment isolation (separate env, worker deployment, or tenant pilot controls) provides explicit scoping. Operators must not assume per-tenant flag behavior without confirmed deployment isolation.

---

## Rollback

### What is NOT safe

**`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` is NOT a safe standalone rollback for an active OAuth-managed Facebook tenant.**

When the resolver flag is disabled, Facebook outbound **skips channel-connect resolution** and may use the **legacy manual/env credential path**. That path may route through a **different Page or token** than the OAuth-managed connection. Do **not** describe resolver-off as an automatic safe fallback for OAuth tenants.

### Safe rollback sequence (OAuth-managed tenant)

1. **Disable `HUBCHAT_FACEBOOK_OAUTH_ENABLED` first** to stop new OAuth connection activity (UI and OAuth start/reconnect flows).
2. **Do not rely on resolver-off alone** for OAuth-managed tenants still expected to send outbound.
3. **Explicitly stop Facebook outbound** or **validate the intended manual Page ID and token** before enabling legacy outbound on manual/env credentials.
4. **Retain OAuth credentials** in `channel_credentials` during immediate rollback — do not delete connection rows or revoke tokens solely because rollback started.
5. **Reverting PR #228** restores pre-1E worker behavior but also restores the **previous silent-fallback risk** (OAuth credential defects may fall back to manual/env). Use only with awareness of that regression.
6. **Production rollout remains blocked** until PR #227 contains equivalent rollback safeguards in the operator runbook.

### Legacy / non-OAuth tenants

For tenants with **no OAuth-managed connection**, disabling the resolver flag returns Facebook outbound to manual/env behavior per existing rollout rules — subject to the same environment-wide flag scope noted above.

---

## Agent B notes

No UI file changes. Channel Settings health/reconnect UX from PR #224 unchanged.
