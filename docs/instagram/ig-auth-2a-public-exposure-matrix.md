# IG-AUTH-2A — Public Credential Exposure Matrix

Audit baseline: master `7c3435b`. **Phase 2A:** schema/repository foundation only — public API must not change.

Reference architecture: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md) ADR-3 (extended credential store), ADR-6 (resolver), IG-AUTH-1B safe API contract.

---

## Risk legend

| Level | Meaning |
|-------|---------|
| **Current** | Risk on master today |
| **2A-new** | Risk if new OAuth columns/repository methods leak without guards |
| **Future** | Risk when OAuth routes/DTOs ship (post-2A; out of 2A scope) |

---

## Exposure matrix

| Surface | Route / module | Current fields exposed | Risk from new OAuth columns | Required protection | Existing test | Missing test |
|---------|----------------|------------------------|----------------------------|---------------------|---------------|--------------|
| Channel Settings list | `GET /api/channel-settings` | `ChannelSettingPublicDto`: `secretState` SET/EMPTY, fingerprints via `secretsConfigured`, sanitized `configJson`, `providerPageId`, `status`, `lastError` | Accidental inclusion of `auth_method`, `credential_version`, `granted_scopes`, `token_expires_at`, refresh fields if repository row spread into mapper | Keep `SAFE_LIST_SELECT` (no `secret_json`); `toChannelSettingPublicDto` only; no new DTO fields in 2A | `channelSettingsG2A.test.ts`, `channelSettingPublicDto.test.ts` | Snapshot allowlist unchanged after 2A |
| Channel Settings by channel | `GET/PATCH /api/channel-settings/[channel]` | Same DTO; PATCH accepts `secrets` write-only | Same as list; PATCH response must not echo submitted secrets | `mergeChannelSecrets` server-side; response via `toChannelSettingPublicDto` | `channelSettingsG2A.test.ts` | IG-AUTH-2A regression: PATCH still returns legacy shape |
| Test connection | `POST .../test-connection` | `ChannelTestConnectionResponseDto`: `ok`, `status`, `message`, `lastVerifiedAt`, `lastError` — no secrets | Health probe could leak provider token in `message`/`lastError` if Graph errors not sanitized; OAuth resolver could attach internal paths | `sanitizeProviderErrorMessage`; no runtime config in response; 2A must not switch Instagram to OAuth resolver | `channelSettingsTestConnection.test.ts`, E2E `channel-settings-smoke.spec.ts` | Assert Instagram test still uses `channel_settings` DB path only |
| Facebook OAuth status (reference) | `GET /api/channel-connect/facebook/status` | Safe display state, connection metadata, credential state badges — no tokens | Pattern for future IG OAuth; `assertFacebookOAuthPublicDtoSafe` blocks tokens, codes, encrypted fields | Blocked-pattern assertion before `ok()`; metadata SELECT excludes ciphertext | `facebookOAuthRoutes.test.ts` | N/A for 2A (no IG routes) |
| Channel connection public DTO | `channelConnectionPublicDto.ts` | `ChannelConnectionPublicDto`, `ChannelCredentialMetadataDto`: fingerprints, `tokenExpiresAt`, `credentialState` — no ciphertext | New columns (`provider_user_id`, `granted_scopes`, `credential_version`, `last_refresh_*`) could leak if SELECT widened or DTO extended prematurely | `CHANNEL_CREDENTIAL_METADATA_SELECT` explicit; `BLOCKED_PUBLIC_KEYS`; `assertPublicConnectionDtoSafe` | `channelConnectionPublicDto.test.ts` | 2A: no new public DTO fields without IG-AUTH-2C contract |
| Channel connection repository | `supabaseChannelConnectionRepository.ts` | Internal: `CHANNEL_CREDENTIAL_INTERNAL_SELECT` includes `encrypted_secret_value` | Decrypt methods returning plaintext to callers that serialize to HTTP; log on decrypt failure | Decrypt only in runtime resolver paths; never return plaintext from list/public methods | `supabaseChannelConnectionRepository.test.ts` | Token never serialized test for any new Instagram methods |
| Setup Wizard / Channel Connect | No Instagram routes on master | Facebook wizard only under `/api/channel-connect/facebook/*` | Future IG wizard could expose OAuth session internals | Defer to IG-AUTH-2C; use IG-AUTH-1B prohibited field list | Facebook OAuth tests | IG connect route absence test (optional) |
| Analytics overview | `GET /api/analytics/overview` | Aggregates by `connectionScope`; no credential fields | Low — unless joins pull credential tables | Keep analytics queries off `channel_credentials` secret columns | Analytics contract tests | None for 2A |
| Ops runtime | `GET /api/ops/runtime` | Queue/outbox stats only | Low | RPCs must not include credential tables | Ops route tests | None for 2A |
| Logs / errors | Worker, API `serverError`, webhook signature logs | `channelConnectRuntimeDiagnostics.ts` redacts token-like patterns; `sanitizeProviderErrorMessage` | Internal refresh failures could log token fragments if raw Meta body logged | Extend `TOKEN_LIKE` redaction; no `console.log` of repository rows | `logError.test.ts`, retention sanitizers | Refresh error path log review in Agent A PR |
| Supabase row serialization | Repository `select()` strings | Explicit column lists — no `*` on credential tables | `select("*")` after migration adds OAuth columns | Code review gate: explicit SELECT only | Migration tests assert column names | Lint/review rule for `select("*")` on credential tables |
| Frontend mapper | `channelSettingsModel.ts` | Parses `secretState`; `FORBIDDEN_LEAK_PATTERNS` rejects leaks in serialized view | New API fields auto-rendered if parser becomes permissive | Strict parser allowlist; extend `FORBIDDEN_LEAK_PATTERNS` for OAuth internals | `channelSettingsModel.test.ts`, E2E secret leak tests | 2A: parser unchanged — no new fields accepted |
| React state | `ChannelSettingsPage.tsx` | `secretInputs` transient until save; cleared on reload | N/A for 2A (no OAuth UI) | Keep transient-only; no OAuth code in storage | E2E `channel-settings-smoke.spec.ts` | None for 2A |
| Browser storage | `sessionConfig.ts` / `localStorage` | HubChat session `accessToken` (auth JWT) — not IG secrets | OAuth callback params must not be stored (future) | No IG credential keys in localStorage | E2E storage checks | None for 2A |
| Test fixtures / snapshots | `channel-settings-smoke.spec.ts`, route tests | Placeholder tokens in mocks only; assertions reject in responses | Fixtures copying real ciphertext from dev DB | Use placeholders; `must-not-appear` assertions | Multiple route tests | Agent A tests must not commit real tokens |

---

## Potential exposure paths (priority order)

1. **Row spread into HTTP response** — `return ok({ data: row })` after widening DB row type with OAuth columns.
2. **SELECT list drift** — `CHANNEL_CREDENTIAL_METADATA_SELECT` or `SAFE_LIST_SELECT` accidentally includes ciphertext or scope payloads with secrets.
3. **Error message leakage** — Meta Graph `access_token=…` in URLs logged or returned in `lastError` / `last_error_message_safe`.
4. **Repository API surface creep** — New public methods on `ChannelConnectionRepository` called from routes before safe DTO exists.
5. **Cross-tenant read** — Missing `tenant_id` + `connection_id` guard on new credential queries.
6. **ENV fallback in repository** — Silent read from `process.env` when DB credential missing (forbidden for OAuth-managed).
7. **Frontend permissive parsing** — `parseChannelSettingsResponse` accepting unknown keys into React state (low risk in 2A if API unchanged).
8. **Test output** — Failed assertion dumps full response body containing test tokens (mitigate with sanitizers).
9. **Analytics join expansion** — Future joins to `channel_credentials` without column projection.

---

## Prohibited public fields (enforcement map)

| Field / pattern | Block at | Enforcement today |
|-----------------|----------|-------------------|
| `secret_json` / `encrypted_secret_value` | Repository SELECT + DTO mapper | Excluded from public SELECT constants |
| Raw `access_token` values | API response + frontend parser | `secretState` only; `FORBIDDEN_LEAK_PATTERNS` |
| `authorizationCode` / OAuth `code` | OAuth routes | `assertFacebookOAuthPublicDtoSafe` (IG: future) |
| `credential_version` | Public DTO | Not in any public type today |
| `granted_scopes` (if containing secrets) | Public DTO | Not exposed; scope names only in future safe DTO |
| Internal refresh error bodies | `lastError`, logs | `sanitizeProviderErrorMessage`; manual review |
| Encryption metadata | Public DTO | Not exposed |

---

## Sanitized future fields (not phase 2A)

Per IG-AUTH-1B [`ig-oauth-safe-api-contract.md`](ig-oauth-safe-api-contract.md) — require new `InstagramConnectStatusDto` and route family (IG-AUTH-2C) before browser exposure:

| Field | Sanitization rule |
|-------|-------------------|
| `authMethod` | Enum only: `OAUTH` \| `LEGACY` \| `NONE` |
| `providerAccountIdMasked` | Last 4 digits / masked Professional Account ID |
| `tokenExpiresAt` | ISO8601 server-computed |
| `lastRefreshAt` | ISO8601 |
| `lastRefreshStatus` | `SUCCESS` \| `FAILED` \| `NOT_APPLICABLE` |
| `credentialHealth` | No token material; delivery path enum only |
| `safeErrorCode` | Taxonomy enum; no provider raw body |

---

## Instagram-specific notes (master)

- Instagram Channel Settings uses `channel_settings` only — **not** `channel_connections` credential store.
- Worker Instagram outbound uses `DB_WITH_ENV_FALLBACK` (documented P1 in IG-AUTH-0) — **unchanged** in 2A.
- `token_expires_at` already exists on `channel_credentials` and is exposed for **Facebook** credential metadata — Instagram OAuth credentials must follow same metadata-only rule when wired in later phases.

---

## Agent A PR diff watchlist

When reviewing IG-AUTH-2A implementation, flag immediately if diff touches:

```text
app/api/channel-settings/**
src/lib/channelSettingPublicDto.ts
src/domain/channelSettings.ts          (public DTO shape)
src/ui/ChannelSettingsPage.tsx
src/ui/channelSettingsModel.ts
app/api/channel-connect/instagram/**   (should not exist in 2A)
```

Allowed in 2A:

```text
supabase/migrations/*
src/infrastructure/adapters/repositories/*
src/domain/channelConnections.ts       (internal types only)
src/lib/channelCredentialEncryption.ts
tests for repository (no route exposure)
```
