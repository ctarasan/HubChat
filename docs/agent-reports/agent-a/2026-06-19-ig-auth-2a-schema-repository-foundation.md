# IG-AUTH-2A — Instagram OAuth Schema and Repository Foundation

> **Agent A implementation report**  
> **Branch:** `feature/ig-auth-2a-schema-repository-foundation`  
> **Base master SHA:** `7c3435b6ea94bf185ed6fbf1e3bfb070764e0b44`

---

## Inspected current model

| Area | Finding |
| --- | --- |
| Credential store | `channel_credentials` (CCP-1) stores encrypted secrets per `connection_id` + `credential_type`; legacy runtime path unchanged |
| Encryption | `src/lib/channelCredentialEncryption.ts` — AES-256-GCM `v1:` format via `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` |
| Tenant/connection FK | `channel_credentials.connection_id → channel_connections.id` (cascade); `tenant_id` duplicated for scoped queries |
| Soft delete/revocation | Connection `REVOKED` status + credential `credential_state = REVOKED`; no row hard-delete pattern |
| Migration naming | `YYYYMMDDHHMMSS_<ticket>_<description>.sql` under `supabase/migrations/` |
| Repository pattern | Supabase adapter in `src/infrastructure/adapters/repositories/`; interface in `src/domain/ports.ts`; mock client unit tests |
| Supabase types | No generated `database.types.ts`; hand-maintained select strings + row mappers |
| Migration tests | SQL file assertions in `src/lib/*Migration.test.ts` |

---

## Schema decision

**Dedicated additive table:** `instagram_oauth_credentials`

Rationale:

- IG-AUTH-2A requires lifecycle statuses, optimistic versioning, and historical `REVOKED`/`DISCONNECTED` rows without disturbing CCP-1 `channel_credentials` runtime consumers.
- Partial unique indexes enforce one active credential per connection while preserving terminal history.
- Zero change to existing `channel_credentials` reads used by worker/resolver today.

Legacy Page-token compatibility remains on existing `channel_credentials.ACCESS_TOKEN` until later phases migrate consumers.

---

## Table / columns / indexes

**Migration:** `supabase/migrations/20260619120000_ig_auth_2a_instagram_oauth_credential_foundation.sql`

**Enums:**

- `instagram_oauth_auth_family`: `LEGACY_FACEBOOK_PAGE`, `INSTAGRAM_BUSINESS_LOGIN`
- `instagram_oauth_credential_status`: `PENDING`, `ACTIVE`, `TOKEN_EXPIRING`, `REFRESHING`, `REAUTH_REQUIRED`, `REVOKED`, `DISCONNECTED`, `ERROR`
- `instagram_oauth_refresh_status`: `NEVER`, `SUCCESS`, `RETRYABLE_FAILURE`, `TERMINAL_FAILURE`
- `instagram_oauth_connection_health_status`: `UNKNOWN`, `HEALTHY`, `DEGRADED`, `UNHEALTHY`

**Key columns:** `tenant_id`, `channel_connection_id`, `auth_family`, `credential_status`, `access_token_ciphertext`, `token_expires_at`, `refresh_eligible_at`, `last_refresh_*`, `granted_scopes`, `provider_instagram_account_id`, `provider_user_id`, `credential_version`, timestamps.

**Indexes:**

- `idx_instagram_oauth_credentials_tenant`
- `idx_instagram_oauth_credentials_tenant_connection`
- `idx_instagram_oauth_credentials_connection`
- **Partial unique** `idx_instagram_oauth_credentials_active_connection` on `channel_connection_id` where status ∈ `{PENDING, ACTIVE, TOKEN_EXPIRING, REFRESHING, REAUTH_REQUIRED}`
- **Partial unique** `idx_instagram_oauth_credentials_active_ig_account` on `provider_instagram_account_id` for same active predicate (prevents cross-tenant duplicate active binding)

**Rollback (manual):** commented `DROP TABLE` / `DROP TYPE` notes at migration footer — not executed automatically.

---

## Repository contract

`InstagramOAuthCredentialRepository` in `src/domain/ports.ts`, implemented by `SupabaseInstagramOAuthCredentialRepository`.

| Method | Purpose |
| --- | --- |
| `createPending` | Insert `PENDING` row (no token) |
| `activate` | Encrypt token, bind IG account identity, transition to `ACTIVE` |
| `findByConnection` | Tenant + connection scoped history (metadata only) |
| `findActiveByConnection` | Latest non-terminal credential |
| `updateLifecycle` | Enforced status transitions |
| `replaceAccessTokenAtomically` | Optimistic versioned token swap for future refresh |
| `markReauthRequired` | Terminal refresh failure path |
| `markRevoked` | Provider/operator revocation |
| `disconnect` | Operator disconnect |
| `retrieveDecryptedMaterial` | Internal runtime-only decrypt (not wired in 2A) |

Every operation requires `tenantId` + `channelConnectionId`.

---

## Encryption path

Uses canonical `encryptChannelCredentialPlaintext` / `decryptChannelCredentialCiphertext`. Metadata selects exclude `access_token_ciphertext`. Tests use `test-instagram-access-token` placeholders only.

---

## Lifecycle transitions

Enforced in `src/lib/instagramOAuthCredentialLifecycle.ts`. Blocks `DISCONNECTED → ACTIVE`, `REVOKED → ACTIVE`, and other unsafe paths. Repository tests cover activate, refresh replace, reauth, revoke, disconnect.

---

## Public API isolation

No changes to Channel Settings DTO, `channel_settings` repository, or worker composition. Regression test asserts existing `CHANNEL_CONNECTION_PUBLIC_SELECT` / `CHANNEL_CREDENTIAL_METADATA_SELECT` unchanged.

---

## Feature flags

`src/lib/instagramOAuthFoundationFlags.ts`:

- `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` — default OFF
- `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` — default OFF

Declarations only; **no runtime wiring** in IG-AUTH-2A.

---

## Tests

| File | Coverage |
| --- | --- |
| `instagramOAuthCredentialMigration.test.ts` | Forward migration safety, indexes, rollback notes |
| `instagramOAuthCredentialLifecycle.test.ts` | Transition matrix |
| `instagramOAuthFoundationFlags.test.ts` | Default-off flags |
| `supabaseInstagramOAuthCredentialRepository.test.ts` | CRUD, encrypt, tenant isolation, atomic replace, public select regression |

---

## Migration risk

| Risk | Mitigation |
| --- | --- |
| New table only | No alteration of `channel_credentials` or `channel_connections` |
| Partial unique conflicts on reconnect | Future OAuth callback must terminalize prior row before new `PENDING` insert |
| Global IG account unique | Active binding limited to one tenant; historical rows on other tenants allowed after terminal status |

---

## Deferred work (out of scope)

- IG-AUTH-2B connection-bound resolver/queue contract
- IG-AUTH-2C OAuth start/state/callback
- IG-AUTH-2D identity/test-connection parity
- IG-AUTH-2E DM adapter
- IG-AUTH-2F private reply
- IG-AUTH-2G Source Post/profile
- IG-AUTH-2H refresh/reauth job
- IG-AUTH-2I rollout

---

## Scope confirmation

```text
Schema/repository foundation only.
No OAuth routes.
No Meta API calls.
No resolver/runtime cutover.
No queue contract change.
No worker/adapter behavior change.
No Test Connection change.
No UI change.
No environment or production credential change.
No production migration execution.
No deployment.
```
