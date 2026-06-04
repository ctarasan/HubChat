# Agent A Report — CCP-2 DB Runtime Resolver Foundation

**Date:** 2026-06-04
**Branch:** `feature/ccp-2-db-runtime-resolver-foundation`
**Scope:** Channel Connect Platform runtime resolver foundation (no production wiring)

## Summary

CCP-2 adds a provider-neutral **Channel Connect runtime resolver** layer that reads `channel_connections` / `channel_credentials` (CCP-1) with sanitized diagnostics and ENV fallback support. Production behavior is **unchanged by default** because resolver DB reads require `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (default **false**).

## Resolver architecture

| Module | Role |
|--------|------|
| `src/domain/channelConnectRuntime.ts` | Resolver input/output types, diagnostic codes, provider credential maps |
| `src/lib/channelConnectRuntimeMode.ts` | Per-provider runtime mode parsing + resolver feature flag |
| `src/lib/channelConnectRuntimeDiagnostics.ts` | Sanitized diagnostics + safe log payload builder |
| `src/application/channelConnect/channelConnectRuntimeResolver.ts` | Resolver functions |

### Public resolver functions

- `resolveOutboundChannelCredential(...)` — outbound send credential resolution (LINE / FACEBOOK / INSTAGRAM)
- `resolveInboundChannelConnection(...)` — inbound webhook verification lookup (public key or provider account)
- `resolveChannelConnectionByProviderAccount(...)` — connection lookup helper
- `resolveChannelConnectionByPublicKey(...)` — connection lookup helper for future `/api/webhook/line/connections/{publicConnectionKey}`
- `resolveCredentialMetadataForHealth(...)` — non-secret credential metadata for health checks

### Resolution order (when resolver enabled)

**Outbound (`DB_WITH_ENV_FALLBACK`):**

1. Find connection by `channelConnectionId`, `providerAccountId`, or `(tenantId, provider)`
2. Validate connection status ∈ outbound-ready set
3. Decrypt required credentials from `channel_credentials`
4. On any DB miss/decrypt/key issue → **ENV fallback** with sanitized diagnostic
5. On success → `configSource: DB`

**Outbound (`DB_ONLY`):**

- DB only; missing connection/credential/key → safe failure (no ENV fallback)

**Outbound (`ENV_ONLY` or resolver disabled):**

- Legacy ENV credentials only (`LINE_*`, `FACEBOOK_*`, `INSTAGRAM_*`); **no CCP-1 DB reads**

**Inbound:**

- Lookup by `publicConnectionKey` or tenant/provider account
- Block `REVOKED` / `ERROR` statuses
- Return internal verification material only (`CHANNEL_SECRET` for LINE, `APP_SECRET` for Meta)

## Runtime mode behavior

Uses existing per-provider env vars (unchanged):

| Provider | Env var |
|----------|---------|
| LINE | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` |
| FACEBOOK | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` |
| INSTAGRAM | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` |

Supported values: `ENV_ONLY` (default), `DB_WITH_ENV_FALLBACK`, `DB_ONLY`.

Additional feature flag (new, default off):

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` — when false, resolver never reads CCP-1 tables even if mode is DB_*.

## DB vs ENV fallback

| Mode | Resolver enabled | Behavior |
|------|------------------|----------|
| ENV_ONLY | any | ENV only (current production default) |
| DB_WITH_ENV_FALLBACK | false | ENV only (legacy; same as today) |
| DB_WITH_ENV_FALLBACK | true | CCP-1 DB first → ENV fallback |
| DB_ONLY | true | CCP-1 DB only; fail safely if missing |

Fallback reasons are logged via sanitized diagnostics (`db_connection_missing`, `credential_decrypt_failed`, `encryption_key_missing`, etc.) — never raw tokens/secrets.

## Production behavior unchanged confirmation

- **No worker/webhook rewiring** in this PR
- **No changes** to Channel Settings UI/API
- **No changes** to existing `resolveLineOutboundConfig` / Facebook / Instagram outbound adapters
- Default: `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unset → legacy ENV path
- Existing LINE/Facebook/Instagram inbound/outbound flows continue unchanged

## Encryption key behavior

- `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` required for CCP-1 credential decrypt
- Missing key in `DB_WITH_ENV_FALLBACK` → ENV fallback with `encryption_key_missing` diagnostic
- Missing key in `DB_ONLY` → safe failure
- Decrypt errors never echo ciphertext or plaintext in messages/logs

## Tests added

- `src/application/channelConnect/channelConnectRuntimeResolver.test.ts` — outbound/inbound resolver, all three providers, missing key, decrypt failure, no token leakage
- `src/lib/channelConnectRuntimeMode.test.ts` — mode parsing, feature flag, DB attempt gating

## Remaining work before DB_ONLY production

1. **CCP-3** — Wire resolver behind `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` into worker outbound adapter resolvers (backward-compatible, tested)
2. **CCP-4** — Wire inbound resolver into connection-specific webhook routes (`/api/webhook/line/connections/{publicConnectionKey}`)
3. Setup Wizard UI + OAuth (META-0 / LINE-M0) to populate `channel_connections` / credentials per tenant
4. Ops migration: tenant credentials from ENV → DB; validate health checks; then enable `DB_ONLY` per provider
5. Deprecate per-tenant secrets in Vercel/Railway ENV once all tenants migrated

## Next recommended phase

**CCP-3 — Feature-flagged worker outbound integration:** call `resolveOutboundChannelCredential` from existing LINE/Facebook/Instagram outbound adapter resolvers when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true`, preserving ENV fallback and full test coverage before any ops flag flip.

---

Prior: [CCP-1 foundation](./2026-06-04-ccp-1-channel-connection-credential-foundation.md) · [CCP-0 audit](./2026-06-04-ccp-0-channel-connect-platform-audit-and-architecture.md)
