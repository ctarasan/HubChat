# Agent Report — FB-OAUTH-1C Facebook OAuth Runtime Health and Reconnect

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-15 |
| Phase | FB-OAUTH-1C — Runtime credential activation, operational health, reconnect |
| Branch | `feature/fb-oauth-1c-runtime-health-reconnect` |
| Contracts | [FB-OAUTH-1A](./2026-06-13-fb-oauth-1a-discovery-contract.md), [FB-OAUTH-1D UI](../agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md) |
| Prerequisites merged | PR [#222](https://github.com/ctarasan/HubChat/pull/222) (1A), [#225](https://github.com/ctarasan/HubChat/pull/225) (1B), [#223](https://github.com/ctarasan/HubChat/pull/223) (1D spec), [#224](https://github.com/ctarasan/HubChat/pull/224) (1D UI) |

---

## Summary

Activates Facebook OAuth operational validation and reconnect. Replaces the FB-OAUTH-1B deferred **501** stubs on `POST /health` and `POST /reconnect` with real ADMIN-only, tenant-scoped, token-free behavior.

The first transition to `connectionStatus: READY`, `healthStatus: OK`, and `displayState: CONNECTED` occurs **only** when all five readiness-blocking checks return `PASS`:

1. `CREDENTIAL_RESOLUTION`
2. `PAGE_ACCESS`
3. `REQUIRED_TASKS`
4. `GRAPH_API`
5. `RUNTIME_TEST_CONNECTION`

**Production rollout is not complete.** OAuth remains gated by `HUBCHAT_FACEBOOK_OAUTH_ENABLED` and required Meta configuration.

---

## Files changed

| Area | Path |
|---|---|
| Runtime credential resolver | `src/application/facebookOAuth/facebookOAuthRuntimeCredential.ts` |
| Operational health engine | `src/application/facebookOAuth/facebookOAuthOperationalHealth.ts` |
| OAuth service | `src/application/facebookOAuth/facebookOAuthService.ts` |
| Health route | `app/api/channel-connect/facebook/health/route.ts` |
| Reconnect route | `app/api/channel-connect/facebook/reconnect/route.ts` |
| Test Connection alignment | `src/application/usecases/testChannelConnection.ts`, `app/api/channel-settings/[channel]/test-connection/route.ts` |
| Lifecycle | `src/lib/channelConnectionLifecycle.ts` (`AUTHORIZING` → `READY`) |
| Domain DTOs | `src/domain/facebookOAuth.ts` |
| OAuth repository | `src/infrastructure/adapters/repositories/supabaseOAuthTransactionRepository.ts`, `src/domain/ports.ts` |
| Tests | `src/application/facebookOAuth/facebookOAuthRuntimeCredential.test.ts`, `src/application/facebookOAuth/facebookOAuthOperationalHealth.test.ts`, `src/interfaces/api/facebookOAuthRoutes.test.ts`, `src/lib/channelConnectionLifecycle.test.ts` |

---

## Credential precedence (locked)

For Facebook runtime / Test Connection / operational health:

| Priority | Source | When used |
|---|---|---|
| 1 | **OAuth-managed `channel_credentials`** | Active OAuth connection: `ACCESS_TOKEN` state `SET`, `providerPageId` set, `connectedAt` set after `complete` |
| 2 | **Manual `channel_settings`** | No OAuth-managed connection applies |
| 3 | **Environment fallback** | Only when rollout mode allows (`DB_WITH_ENV_FALLBACK` / `ENV_ONLY`) and no OAuth-managed connection exists |

**OAuth-managed rules:**

- Page token resolves from encrypted `channel_credentials` only — never from `channel_settings.secret_json`
- No dual-write of OAuth token to `channel_settings`
- No silent fallback to manual or env token when OAuth-managed credential is invalid or revoked → `RECONNECT_REQUIRED` / blocking health result
- No credential ID or encrypted material in browser DTOs or logs

---

## OAuth credential resolver behavior

`facebookOAuthRuntimeCredential.ts`:

- `isOAuthManagedFacebookConnection()` — detects OAuth-complete connections
- `resolveOAuthManagedFacebookCredential()` — tenant-scoped decrypt of `ACCESS_TOKEN`
- `resolveFacebookRuntimeCredentialForTest()` — shared path for Test Connection and `RUNTIME_TEST_CONNECTION`

`RUNTIME_TEST_CONNECTION` additionally requires `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` for OAuth-managed connections. When resolver is off, check returns `FAIL` and aggregation stays pre-READY (`AUTHORIZING` / `CONNECTING`).

---

## Health endpoint (`POST /api/channel-connect/facebook/health`)

| Control | Value |
|---|---|
| Auth | ADMIN only |
| Scope | `auth.tenantId` |
| Response | Token-free structured `checks[]` |

**Check semantics:**

| Code | Validates |
|---|---|
| `CREDENTIAL_RESOLUTION` | Encrypted OAuth credential decrypts; tenant/connection ownership; credential active |
| `PAGE_ACCESS` | Graph Page access; returned Page ID matches stored `providerPageId` |
| `REQUIRED_TASKS` | Required Page tasks present (e.g. `MESSAGING`) |
| `GRAPH_API` | Bounded Graph reachability probe (`/me?fields=id`) |
| `RUNTIME_TEST_CONNECTION` | Shared resolver + `verifyFacebookChannelHealth` using OAuth credential |

**Aggregation (pre-first-READY):**

| Outcome | `connectionStatus` | `healthStatus` | `displayState` | `reconnectRequired` |
|---|---|---|---|---|
| All five `PASS` | `READY` | `OK` | `CONNECTED` | `false` |
| Any `WARN`/`FAIL`, reconnect not proven | `AUTHORIZING` | `DEGRADED` or `ERROR` | `CONNECTING` | `false` |
| Revoked/invalid token or reconnect proven | `RECONNECT_REQUIRED` | `RECONNECT_REQUIRED` | `NEEDS_RECONNECT` | `true` |

Persists: `last_health_check_at`, `last_error_code` (sanitized `errorCategory`), `last_error_message_safe`. No raw Graph JSON in response or logs.

**No premature READY/CONNECTED:** aggregation never sets `READY`/`CONNECTED` unless all five checks `PASS`.

---

## Reconnect endpoint (`POST /api/channel-connect/facebook/reconnect`)

| Control | Value |
|---|---|
| Auth | ADMIN only |
| Scope | `auth.tenantId` |
| Response | Token-free `{ authorizeUrl, expiresAt }` |

Behavior:

1. Requires existing OAuth-managed connection
2. `expireActiveTransactionsForConnection()` — supersedes active OAuth transactions (fresh state; no reuse)
3. Creates new OAuth transaction with new random `state`
4. Preserves current connection record and credential until new OAuth flow completes successfully
5. Transitions `RECONNECT_REQUIRED` / eligible states → `AUTHORIZING` when lifecycle allows
6. Does not claim success until new OAuth + all five health checks `PASS`
7. Sanitized errors on failure; prior credential intact if initiation fails

---

## Status and Test Connection alignment

**`GET /status`:** derives `healthStatus`, `reconnectRequired`, `lastCheckedAt`, and sanitized `errorCategory` from persisted connection health fields (not inferred from token presence alone).

**`POST /channel-settings/facebook/test-connection`:** injects `channelConnectionRepository`; OAuth-managed connections use the same `resolveFacebookRuntimeCredentialForTest()` path as health `RUNTIME_TEST_CONNECTION`. Manual `channel_settings` path unchanged when OAuth does not apply.

---

## Outbound / runtime alignment

OAuth credential activation is scoped to operational health and Test Connection in this PR. Existing `channelConnectRuntimeResolver` outbound path for `AUTHORIZING` connections remains unchanged (worker outbound still requires `OUTBOUND_READY` statuses).

**Deferred:** inbound Graph enrichment / webhook token resolution still using global env configuration (FB-OAUTH-1C-follow-up / FB-TOKEN work).

Manual Facebook and env-fallback production behavior preserved when no OAuth-managed connection applies.

---

## Authorization and tenant isolation

- Health and reconnect: `requireAuth(req, ["ADMIN"])`
- Connection lookup: `findByTenantAndProvider(auth.tenantId, "FACEBOOK")`
- Credential decrypt: `tenantId` + `connectionId` scoped repository calls
- OAuth transaction expire/create: tenant-scoped
- MANAGER/SALES denied (route tests)

---

## Security controls

- No token, code, state, or credential ID in public DTOs (`assertFacebookOAuthPublicDtoSafe`)
- Graph errors sanitized via `sanitizeProviderErrorMessage`
- Reconnect state: cryptographically random, expiring, single-use (reuses 1B transaction model)
- Authorization URL server-generated (no open redirect)
- No silent cross-Page token fallback for OAuth-managed connections
- Encrypted token at rest in `channel_credentials` (unchanged from 1B)

---

## Lifecycle transitions

Added: `AUTHORIZING` → `READY` (health aggregation on all-five-PASS).

Health may also transition `AUTHORIZING` → `RECONNECT_REQUIRED` when reconnect is proven.

---

## Test evidence

| Suite | Coverage |
|---|---|
| `facebookOAuthRuntimeCredential.test.ts` | OAuth precedence, decrypt, no silent fallback |
| `facebookOAuthOperationalHealth.test.ts` | All-five-PASS → READY; resolver off blocks runtime; reconnect proven; page mismatch |
| `facebookOAuthRoutes.test.ts` | Health 200 (not 501); MANAGER denied; reconnect authorizeUrl |
| `channelConnectionLifecycle.test.ts` | `AUTHORIZING` → `READY` allowed |
| Full `npm test` | LINE / Instagram / existing channel-connect regression |

Verification commands: `npx tsc --noEmit`, `npm test`, `git diff --check`.

---

## Migration status

No new migration in FB-OAUTH-1C. Uses existing:

- `oauth_transactions` (FB-OAUTH-1B)
- `channel_connections` / `channel_credentials` (CCP foundation)

---

## Production configuration requirements

| Variable | Purpose |
|---|---|
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` | Enable OAuth surfaces |
| `META_APP_ID` / `FACEBOOK_APP_SECRET` | OAuth app credentials |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Credential encrypt/decrypt |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` | Required for OAuth `RUNTIME_TEST_CONNECTION` PASS |
| Meta OAuth redirect URI | Must match deployed callback URL |

**Do not enable production OAuth until:** PR merged, deployment ready, migration confirmed, Meta config verified, health/reconnect smoke pass, no secret leakage, rollback confirmed.

---

## Rollout gates

1. PR review and merge
2. Deploy to staging / App Role internal test
3. Full OAuth flow: start → callback → pages → complete → **health** → CONNECTED
4. Reconnect smoke from `RECONNECT_REQUIRED`
5. Manual Facebook Channel Settings regression
6. LINE / Instagram non-regression
7. Worker outbound smoke after READY (separate gate)

---

## Rollback plan

| Layer | Action |
|---|---|
| Feature flag | `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` hides OAuth UI |
| Runtime | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` restores legacy env path for non-OAuth tenants |
| Credentials | OAuth token can be marked `REVOKED`; manual `channel_settings` unchanged |
| Code | Revert PR; health/reconnect return to 501 stubs in 1B |

---

## Deferred scope

- Inbound Graph / webhook token resolver off global env (FB-OAUTH-1C-follow-up)
- Worker outbound using `AUTHORIZING` connection before READY
- Post-READY supplemental optional health checks (row E in contract)
- Production env variable changes from this PR (none made)

---

## Agent B review notes

- UI already handles five-check gate and deferred 501 in PR #224; this PR activates backend health/reconnect
- No Agent B UI file changes in this PR
- E2E smoke recommended post-deploy: health checklist → CONNECTED, reconnect banner flow
