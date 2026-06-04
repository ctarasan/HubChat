# Agent Report — CCP-1 Channel Connection Credential Foundation

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-04 |
| Phase | CCP-1 — DB connection/credential foundation |
| Branch | `feature/ccp-1-channel-connection-credential-foundation` |
| Status | Complete |

## Goal

Add additive DB + domain + repository foundation for the Channel Connect Platform without changing production LINE/Facebook/Instagram runtime behavior.

## Why `channel_credentials` instead of extending `channel_settings`

| Concern | `channel_settings` today | New CCP tables |
|---|---|---|
| Lifecycle | enabled + config health only | Full wizard lifecycle (`DRAFT` → `READY`, `RECONNECT_REQUIRED`, …) |
| Credential types | Flat `secret_json` map | Typed rows (`ACCESS_TOKEN`, `CHANNEL_SECRET`, …) with state |
| Encryption | Plaintext in DB (service role) | AES-256-GCM ciphertext + fingerprint |
| Routing | One row per `(tenant, channel)` | `public_connection_key` for future wizard callbacks |
| Production risk | Active in worker/API today | **Not wired** until CCP-2 |

Extending `channel_settings` in-place would risk breaking G2 Channel Settings and outbound resolvers. CCP-1 adds parallel foundation tables only.

## Migration summary

**File:** `supabase/migrations/20260604120000_ccp_1_channel_connection_foundation.sql`

- Additive enums: `channel_connection_status`, `channel_credential_state`, `channel_credential_type`
- Table `channel_connections` (unique `tenant_id + provider`, unique `public_connection_key`)
- Table `channel_credentials` (unique `connection_id + credential_type`, FK cascade)
- **No backfill** of production credentials
- `schema.sql` mirrored

## Schema summary

### `channel_connections`

Lifecycle, provider account metadata, webhook fields, health timestamps, safe error fields, `public_connection_key`, audit timestamps.

### `channel_credentials`

Encrypted secret blob, fingerprint, token expiry, credential state badge, tenant + connection scoping.

## Domain / repository / DTO summary

| Layer | Files |
|---|---|
| Domain | `src/domain/channelConnections.ts` |
| Lifecycle | `src/lib/channelConnectionLifecycle.ts` |
| Encryption | `src/lib/channelCredentialEncryption.ts` (`HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`) |
| Public DTO | `src/lib/channelConnectionPublicDto.ts` |
| Port | `ChannelConnectionRepository` in `src/domain/ports.ts` |
| Supabase | `src/infrastructure/adapters/repositories/supabaseChannelConnectionRepository.ts` |

**Security behavior:**

- Public reads/DTOs: no raw secrets; credential badges only (`EMPTY` / `SET` / `EXPIRED` / `REVOKED`)
- Internal runtime: `retrieveDecryptedCredentialForRuntime()` only (not used by HTTP yet)
- Safe errors via `sanitizeProviderErrorMessage` patterns
- Tenant scoping enforced on reads/updates

## Tests added

| File | Coverage |
|---|---|
| `channelCredentialEncryption.test.ts` | encrypt/decrypt round-trip, malformed input |
| `channelConnectionLifecycle.test.ts` | public key, provider/status validation, transitions |
| `channelConnectionPublicDto.test.ts` | public DTO safety, error sanitization |
| `supabaseChannelConnectionRepository.test.ts` | CRUD, lifecycle, webhook, credentials, tenant scope, migration SQL |

## Production behavior unchanged

- No worker/bootstrap wiring
- No webhook route changes
- No Channel Settings API changes
- No runtime mode changes (`DB_ONLY` not enabled)
- No ENV fallback removal
- No Setup Wizard / OAuth / LINE Module Channel implementation

## Guardrails confirmation

- No secrets in logs/tests/docs
- No marketplace files
- No package changes
- Additive migration only

## Next recommended phase

**CCP-2 — DB runtime resolver foundation**

- Wire `ChannelConnectionRepository` into inbound webhook tenant/credential lookup (feature-flagged)
- Wire outbound resolver to read decrypted credentials per tenant connection
- Keep `DB_WITH_ENV_FALLBACK` until CHW-1 completes per tenant

## Related docs

- CCP-0: `docs/agent-reports/agent-a/2026-06-04-ccp-0-channel-connect-platform-audit-and-architecture.md`
- Index: `docs/ccp-0-channel-connect-platform-index.md`
