# Agent Report — FB-OAUTH-1A Facebook OAuth Long-Lived Page Connection Discovery & Contract

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-13 |
| Phase | FB-OAUTH-1A — Discovery + implementation contract (**no runtime code in this PR**) |
| Related specs | CCP-0 (`docs/ccp-0-channel-connect-wizard-ux-spec.md`), CCP-1 foundation |
| Canonical production app | `https://smartkorp-hub-chat.vercel.app` (per operator runbooks) |
| Facebook webhook callback | `POST /api/webhook/facebook` (Instagram object also routes here) |

---

## Executive summary

| Area | Current (repository facts) | Proposed (FB-OAUTH-1A+) |
|---|---|---|
| Facebook connect UX | Manual **Channel Settings** (`/dashboard/channel-settings`) | Assisted wizard + OAuth (`/dashboard/channel-connect` per CCP-0 spec — **not built**) |
| Token storage (production path) | `channel_settings.secret_json` — **plaintext at rest** | `channel_credentials.encrypted_secret_value` (AES-GCM) + optional legacy bridge |
| Outbound token resolution | `resolveFacebookOutboundConfig` — `DB_WITH_ENV_FALLBACK` reads `channel_settings` | Same resolver extended to prefer `channel_connections` when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` |
| Inbound webhook Graph token | **Global env** `FACEBOOK_PAGE_ACCESS_TOKEN` only | Tenant-scoped resolver (post-OAuth follow-up; out of 1A scope) |
| Meta OAuth flow | **Not implemented** — no `/api/**/oauth**` routes | New ADMIN-only OAuth transaction API (contract below) |
| CSRF | **None** in repo | Required for browser OAuth callback |

**Migration decision:** **Minimum migration required** — add `oauth_transactions` (or equivalent) table for state/nonce binding. Existing `channel_connections` + `channel_credentials` are **sufficient** for persisted Page token, Page ID, health fields, and lifecycle status with minor optional column adds (see §7).

---

## 1. Existing channel configuration

### 1.1 `channel_connections` (CCP-1)

**Schema:** `supabase/migrations/20260604120000_ccp_1_channel_connection_foundation.sql`, mirrored in `supabase/schema.sql`.

| Column | Facebook relevance |
|---|---|
| `tenant_id` | Tenant isolation; `unique (tenant_id, provider)` — one FACEBOOK row per tenant |
| `provider` | `'FACEBOOK'` |
| `status` | `channel_connection_status` enum (see §1.6) |
| `provider_page_id` | Selected Facebook Page ID |
| `provider_account_id` / `provider_account_name` | Meta user/account metadata (optional) |
| `public_connection_key` | `ccp_*` routing id — `generatePublicConnectionKey()` in `src/lib/channelConnectionLifecycle.ts` |
| `webhook_endpoint` / `webhook_active` | Future per-tenant webhook registration state |
| `last_*_verified_at`, `last_health_check_at` | Health timestamps |
| `last_error_code` / `last_error_message_safe` | Sanitized provider errors |
| `connected_by` / `connected_at` | ADMIN attribution |

**Repository:** `src/infrastructure/adapters/repositories/supabaseChannelConnectionRepository.ts` — `createConnection`, `storeEncryptedCredential`, `retrieveDecryptedCredentialForRuntime`, tenant guards on all reads.

**Domain:** `src/domain/channelConnections.ts` — `ChannelConnectionRecord`, credential types `ACCESS_TOKEN`, `APP_SECRET`, `VERIFY_TOKEN`.

### 1.2 `channel_credentials` (encrypted secrets)

| Column | Purpose |
|---|---|
| `credential_type` | `ACCESS_TOKEN` = Page access token; `APP_SECRET`; `VERIFY_TOKEN` |
| `encrypted_secret_value` | AES-256-GCM (`src/lib/channelCredentialEncryption.ts`) |
| `secret_fingerprint` | SHA-256 prefix for diagnostics |
| `token_expires_at` | Optional Page token expiry metadata |
| `credential_state` | `EMPTY` \| `SET` \| `EXPIRED` \| `REVOKED` |

**Key env:** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` — required for encrypt/decrypt path.

### 1.3 `channel_settings` (production manual path today)

**Schema:** `supabase/migrations/20260520120000_phase_ii_g1_a_channel_settings.sql`.

| Column | Facebook use |
|---|---|
| `config_json` | `providerPageId`, `lastVerifiedAt`, `lastError` (public metadata) |
| `secret_json` | **Plaintext** keys: `page_access_token`, `app_secret`, `verify_token` |
| `secret_fingerprint_json` | Fingerprints only |

**API secret mapping:** `src/lib/channelSettingApiSecrets.ts` — `accessToken` → `page_access_token`, `appSecret` → `app_secret`, `verifyToken` → `verify_token`.

**Write-only exposure:** `src/lib/channelSettingPublicDto.ts` — `toChannelSettingPublicDto` returns `secretState: EMPTY|SET` + fingerprints, never raw values. UI: `src/ui/channelSettingsModel.ts` — `readSecretDraftValue` documents write-only drafts.

**Configured gate:** `isChannelConfigured` — FACEBOOK requires all three secrets SET (`src/lib/channelSettingPublicDto.ts`).

### 1.4 `DB_WITH_ENV_FALLBACK` (outbound)

**File:** `src/lib/facebookOutboundRuntimeConfig.ts`

| Mode env | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` (default `ENV_ONLY` if unset) |
|---|---|
| `DB_WITH_ENV_FALLBACK` | `getRuntimeConfig(tenantId)` from `channel_settings` first; fallback `FACEBOOK_PAGE_ACCESS_TOKEN` env |
| `DB_ONLY` | DB only; throws if missing |
| `ENV_ONLY` | Env only |

**Worker wiring:** `src/worker/main.ts` → `createFacebookOutboundAdapterResolver` → logs `runtimeSource: db | env` (`src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts`).

**Channel Connect overlay:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` + `src/application/channelConnect/channelConnectRuntimeResolver.ts` reads `channel_credentials` when enabled (production default: **OFF** per CCP-4.x evidence).

### 1.5 Active connection scoping

**Conversation scope:** `conversations.channel_connection_id` FK → `channel_connections(id)` (`supabase/migrations/20260608120000_ccw_1a_conversation_channel_connection_id.sql`).

**Runtime scope helper:** `src/domain/channelConnectionScope.ts` — `resolveInboundChannelConnectionId` (inbound worker path).

**List filters:** `connectionScope` on leads/conversations APIs filters by active `channel_connection_id` / `provider_page_id`.

### 1.6 Channel Settings APIs (implemented)

| Route | File | Auth |
|---|---|---|
| `GET /api/channel-settings` | `app/api/channel-settings/route.ts` | `requireAuth(req, ["ADMIN"])` |
| `PATCH /api/channel-settings/[channel]` | `app/api/channel-settings/[channel]/route.ts` | ADMIN |
| `POST /api/channel-settings/[channel]/test-connection` | `app/api/channel-settings/[channel]/test-connection/route.ts` | ADMIN |

**PATCH body** (`PatchBodySchema`): `enabled`, `displayName`, `configJson`, `providerPageId`, `providerAccountName`, `secrets`, `clearSecrets`, `clearSecretKeys`.

**Test connection:** `TestChannelConnectionUseCase` → `verifyFacebookChannelHealth` — Graph `GET /{pageId|me}?fields=id,name` (`src/infrastructure/adapters/channels/channelHealthCheck.ts`).

### 1.7 Connection status enum (implemented, OAuth-ready)

`src/domain/channelConnections.ts` — `DRAFT`, `AUTHORIZING`, `CONNECTED`, `WEBHOOK_CONFIGURED`, `WEBHOOK_VERIFIED`, `INBOUND_VERIFIED`, `OUTBOUND_VERIFIED`, `READY`, `ERROR`, `RECONNECT_REQUIRED`, `REVOKED`.

**Transitions:** `src/lib/channelConnectionLifecycle.ts` — `canTransitionChannelConnectionStatus`, `assertChannelConnectionStatusTransition`. `AUTHORIZING` exists but **no code sets it via OAuth today**.

---

## 2. Existing authorization / security

### 2.1 ADMIN path & tenant isolation

**Auth:** `src/interfaces/api/auth.ts` — `requireAuth(req, roles)` validates Bearer JWT + `x-tenant-id`; role from `sales_agents` DB row (not JWT claims).

**Channel settings:** all routes ADMIN-only; `tenantId` from `auth.tenantId` passed to repositories with `.eq("tenant_id", tenantId)`.

**Connection repo:** `SupabaseChannelConnectionRepository` throws `ChannelConnectionNotFoundError` on tenant mismatch.

### 2.2 Session model

Supabase Auth JWT for dashboard/API. No server-side session store for Channel Settings PATCH beyond JWT validation.

### 2.3 CSRF

**Not implemented** — repo-wide search finds no CSRF middleware. Bearer-token API calls are CSRF-resistant; **OAuth browser callback is not** — must add CSRF/state binding in FB-OAUTH-1A implementation.

### 2.4 Encryption & key handling

| Path | Encryption |
|---|---|
| `channel_credentials` | AES-256-GCM via `encryptChannelCredentialPlaintext` / `decryptChannelCredentialCiphertext` |
| `channel_settings.secret_json` | **No encryption** (legacy) |

### 2.5 Error sanitization & secret redaction

| Utility | File |
|---|---|
| `sanitizeProviderErrorMessage` | `src/lib/sanitizeProviderError.ts` — redacts tokens, `access_token=`, `Bearer`, max 280 chars |
| `toChannelConnectResolverLogPayload` | `src/lib/channelConnectRuntimeDiagnostics.ts` — throws if token-like strings in log JSON |
| `assertPublicConnectionDtoSafe` | `src/lib/channelConnectionPublicDto.ts` — blocks secret keys in public DTOs |
| Test connection persistence | `testChannelConnection.ts` — sanitizes `lastError` before DB write |

**Gap:** `facebookAdapter.ts` some `console.warn` paths may log raw Graph bodies (documented in FB-TOKEN-1).

### 2.6 Audit logging

No dedicated `audit_log` table. Connection health uses `channel_settings.config_json.lastVerifiedAt` / `lastError` and `channel_connections.last_*` fields. OAuth implementation should append `conversation_events`-style connection events or a new `connection_audit_events` table (optional; not required for 1A migration minimum).

---

## 3. Existing Facebook integration

### 3.1 Inbound webhook

**Handler:** `src/interfaces/api/webhook/facebook.ts`

| Concern | Current |
|---|---|
| Signature | `verifyMetaHubWebhookSignature` — `FACEBOOK_APP_SECRET` / `META_APP_SECRET` env |
| GET verify | `FACEBOOK_VERIFY_TOKEN` env **only** (not DB) |
| Tenant | `x-tenant-id` or `DEFAULT_TENANT_ID` |
| Adapter token | **Env** `FACEBOOK_PAGE_ACCESS_TOKEN` only |
| Page ID env | `FACEBOOK_PAGE_ID` |

### 3.2 Outbound adapter

**Class:** `src/infrastructure/adapters/channels/facebookAdapter.ts` — Send API, Private Reply, Graph profile/comment reads.

**Graph version:** `META_GRAPH_VERSION` → `FACEBOOK_GRAPH_VERSION` → default `v25.0` (`normalizeFacebookGraphVersion`).

### 3.3 Platform env vars (today)

| Variable | Role |
|---|---|
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Webhook Graph + env outbound fallback |
| `FACEBOOK_PAGE_ID` | Env page context |
| `FACEBOOK_APP_SECRET` / `META_APP_SECRET` | Webhook HMAC |
| `FACEBOOK_VERIFY_TOKEN` | Webhook hub challenge |
| `META_GRAPH_VERSION` / `FACEBOOK_GRAPH_VERSION` | Graph API version |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Outbound DB/env mode |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Optional `channel_credentials` resolver |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Credential vault key |

**Not in repo as required env today:** `META_APP_ID` / `FACEBOOK_APP_ID` — **required for OAuth implementation** (platform-level, not per-tenant).

### 3.4 Assisted Channel Connection Wizard (spec only)

**Spec:** `docs/ccp-0-channel-connect-wizard-ux-spec.md` — target `/dashboard/channel-connect`, Meta OAuth → Page picker → webhook register → smokes → `READY`.

**Reality:** No `app/dashboard/channel-connect/` page; no `/api/channel-connect/*` routes. Facebook wizard CTA gated until “Meta OAuth routes + token vault” (spec §2).

**Manual fallback preserved:** Channel Settings PATCH remains the supported path during rollout.

---

## 4. OAuth design contract — endpoints & responsibilities

All routes: **ADMIN only**, tenant from `auth.tenantId`, JSON responses **token-free**.

Base path recommendation (aligns with CCP-0 §11): `/api/channel-connect/facebook/...`

| Endpoint | Method | Responsibility |
|---|---|---|
| `/api/channel-connect/facebook/status` | `GET` | Current connection status, Page metadata, health summary, manual-fallback hint |
| `/api/channel-connect/facebook/oauth/start` | `POST` | Create OAuth transaction; return browser redirect URL (no token) |
| `/api/channel-connect/facebook/oauth/callback` | `GET` | Browser redirect from Meta; validate state; exchange code server-side; store short-lived user token in transaction; redirect to UI |
| `/api/channel-connect/facebook/oauth/session` | `GET` | Poll transaction status for UI (`AUTHORIZING`, `PAGES_PENDING`, `ERROR`, etc.) |
| `/api/channel-connect/facebook/pages` | `GET` | List Pages user can manage (from stored user token in transaction — server-side Graph only) |
| `/api/channel-connect/facebook/complete` | `POST` | ADMIN selects Page; exchange long-lived user token → Page access token; encrypt persist; transition connection to `CONNECTED` |
| `/api/channel-connect/facebook/reconnect` | `POST` | Invalidate prior Page token credentials; start new OAuth transaction (or refresh if Meta supports) |
| `/api/channel-connect/facebook/health` | `POST` | Run Graph health check; update `last_health_check_at`, status `READY` or `ERROR` / `RECONNECT_REQUIRED` |
| `/api/channel-connect/facebook/disconnect` | `POST` | Revoke credentials, set `REVOKED` (optional Meta revoke call server-side) |

**Manual-token fallback (preserve):** Existing `PATCH /api/channel-settings/facebook` + `POST .../test-connection` unchanged. OAuth completion should **also** mirror into `channel_settings` during transition period if `DB_WITH_ENV_FALLBACK` remains primary for worker (bridge task FB-OAUTH-1B).

**Canonical redirect URI (production):**

```
https://smartkorp-hub-chat.vercel.app/api/channel-connect/facebook/oauth/callback
```

Staging/preview URIs must be explicitly allowlisted in Meta App settings — no wildcard open redirects.

---

## 5. OAuth transaction security

| Control | Contract |
|---|---|
| `state` | Cryptographically random ≥128 bits; stored server-side hashed |
| Tenant binding | Transaction row includes `tenant_id`; callback rejects mismatch |
| ADMIN binding | Transaction includes `initiated_by_auth_user_id` + `initiated_by_sales_agent_id` |
| Single-use | Transaction `consumed_at` set on successful callback or completion; replay → 409 |
| Expiry | `expires_at` ≤ 15 minutes from start |
| Callback replay | Reject if `consumed_at` set or `expires_at` passed |
| Authorization code | Exchanged **server-side only**; never returned to browser or logged |
| Redirect URI | Exact match against allowlist env `META_OAUTH_REDIRECT_URI` (production URL above) |
| Token logging | Never log access token, code, or `state`; logs use `transaction_id`, `tenant_id`, enum `result` |
| Browser response | After callback, HTTP 302 to `/dashboard/channel-connect?oauth=...` with **status enum only** |
| Provider errors | Map to `error_category` + safe `message` via `sanitizeProviderErrorMessage` |
| CSRF | `state` parameter + optional double-submit cookie for callback GET |

---

## 6. Token lifecycle

| Step | Implementation contract |
|---|---|
| Short-lived user token | From code exchange (`oauth/access_token`) — store encrypted in transaction only, TTL minutes |
| Long-lived user token | `grant_type=fb_exchange_token` — server-side |
| Page access token | `GET /{page-id}?fields=access_token` or `/me/accounts` selection — **persist Page token only** |
| Validation | Verify Page `id`, `name`, `tasks` includes `MESSAGING` / `MODERATE` / `CREATE_CONTENT` as required by product |
| Persist | `channel_credentials` `ACCESS_TOKEN` encrypted; `provider_page_id` on `channel_connections` |
| App secret / verify token | Platform env or tenant `APP_SECRET` / `VERIFY_TOKEN` credentials (Meta App-level secrets remain platform env in phase 1) |
| Reconnect | Mark old `ACCESS_TOKEN` `REVOKED`; new OAuth transaction; status → `AUTHORIZING` |
| Revoked permission | Health check Graph 190 → `credential_state=REVOKED`, connection `RECONNECT_REQUIRED` |
| Replacement | Upsert on `(connection_id, credential_type)` — atomic overwrite fingerprint |

### Connection status semantics (Facebook)

| Status | Meaning |
|---|---|
| `DRAFT` | Row created; OAuth not started |
| `AUTHORIZING` | OAuth transaction in flight |
| `CONNECTED` | Page token stored; webhook not verified |
| `WEBHOOK_CONFIGURED` | Meta subscription API called |
| `WEBHOOK_VERIFIED` | Hub challenge passed |
| `INBOUND_VERIFIED` | Inbound smoke passed |
| `OUTBOUND_VERIFIED` | Outbound smoke passed |
| `READY` | Fully operational |
| `ERROR` | Terminal until operator action |
| `RECONNECT_REQUIRED` | Token expired/revoked; OAuth again |
| `REVOKED` | Disconnected |

**Degraded:** Map to `RECONNECT_REQUIRED` or `ERROR` with `last_error_code` — no separate enum value today.

---

## 7. Data model decision

### Sufficient today (no change required)

- `channel_connections` — Page ID, name, status, health timestamps, `connected_by`, `connected_at`
- `channel_credentials` — encrypted Page token, optional `token_expires_at`, `credential_state`

### Minimum migration (recommended for FB-OAUTH-1A implementation)

**New table: `oauth_transactions`** (name illustrative)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Public `transaction_id` for UI poll |
| `tenant_id` | uuid | FK tenants |
| `provider` | text | `FACEBOOK` |
| `connection_id` | uuid FK | `channel_connections` |
| `state_hash` | text | SHA-256 of OAuth state |
| `status` | text | `PENDING`, `CALLBACK_RECEIVED`, `PAGES_READY`, `COMPLETED`, `FAILED`, `EXPIRED` |
| `initiated_by_auth_user_id` | uuid | |
| `initiated_by_sales_agent_id` | uuid | |
| `encrypted_user_token` | text | Optional interim user token (encrypted) |
| `selected_page_id` | text | Set at completion |
| `error_category` / `error_code_safe` | text | No provider raw body |
| `expires_at` | timestamptz | |
| `consumed_at` | timestamptz | Single-use |
| `created_at` | timestamptz | |

**Optional column adds on `channel_connections` (if not using JSON metadata):**

- `granted_scopes text[]` or `metadata_json.grantedScopes`
- `reconnect_required_at timestamptz`
- `last_error_category text` (distinct from free-text `last_error_message_safe`)

**Not required in 1A PR:** migration SQL — contract only.

**Bridge note:** Until inbound webhook uses tenant resolver, operators may still need env `FACEBOOK_PAGE_ACCESS_TOKEN` sync (FB-TOKEN-1). OAuth should document this operational step until FB-OAUTH-1C inbound resolver ships.

---

## 8. API contract for Agent B (token-free responses)

### 8.1 `GET /api/channel-connect/facebook/status`

```typescript
type FacebookConnectStatusResponse = {
  data: {
    connectionId: string | null;
    status: ChannelConnectionStatus; // DRAFT | AUTHORIZING | ... | READY | RECONNECT_REQUIRED | ...
    providerPageId: string | null;
    providerPageName: string | null;
    webhookActive: boolean;
    lastHealthCheckAt: string | null;
    lastVerifiedAt: string | null;
    lastError: string | null; // sanitized
    credentialState: { pageAccessToken: "EMPTY" | "SET" | "EXPIRED" | "REVOKED" };
    manualFallbackAvailable: true; // Channel Settings path always available
    oauthAvailable: boolean; // platform META_APP_ID configured
  };
};
```

### 8.2 `POST /api/channel-connect/facebook/oauth/start`

**Request:** `{ reconnect?: boolean }`

**Response:**

```typescript
type OAuthStartResponse = {
  data: {
    transactionId: string;
    authorizeUrl: string; // Meta OAuth URL with state param
    expiresAt: string; // ISO
  };
};
```

### 8.3 `GET /api/channel-connect/facebook/oauth/callback`

Browser redirect only. On success: 302 to `/dashboard/channel-connect?transactionId=...&oauthStatus=CALLBACK_OK`. On failure: `oauthStatus=ERROR&errorCategory=...` (no code/state in query).

### 8.4 `GET /api/channel-connect/facebook/oauth/session?transactionId=`

```typescript
type OAuthSessionResponse = {
  data: {
    transactionId: string;
    status: "PENDING" | "CALLBACK_RECEIVED" | "PAGES_READY" | "COMPLETED" | "FAILED" | "EXPIRED";
    errorCategory: string | null;
    message: string | null; // sanitized
    expiresAt: string;
    pagesReady: boolean;
  };
};
```

### 8.5 `GET /api/channel-connect/facebook/pages?transactionId=`

```typescript
type FacebookPageOption = {
  pageId: string;
  name: string;
  tasks: string[]; // e.g. MESSAGING
  alreadyConnected: boolean;
};

type FacebookPagesResponse = {
  data: { pages: FacebookPageOption[] };
};
```

### 8.6 `POST /api/channel-connect/facebook/complete`

**Request:** `{ transactionId: string; pageId: string }`

**Response:**

```typescript
type FacebookCompleteResponse = {
  data: {
    connectionId: string;
    status: "CONNECTED"; // initial; health may advance to READY after POST /health
    providerPageId: string;
    providerPageName: string;
    message: string;
  };
};
```

### 8.7 `POST /api/channel-connect/facebook/reconnect`

Same shape as OAuth start; sets prior credentials `REVOKED`, connection `AUTHORIZING`.

### 8.8 `POST /api/channel-connect/facebook/health`

Mirrors `ChannelTestConnectionResponseDto` fields but for `channel_connections` path:

```typescript
type FacebookHealthResponse = {
  data: {
    ok: boolean;
    status: "READY" | "ERROR" | "RECONNECT_REQUIRED";
    message: string;
    providerPageId: string | null;
    providerPageName: string | null;
    lastVerifiedAt: string | null;
    lastError: string | null;
  };
};
```

---

## 9. Rollout & testing plan

### 9.1 App Role / internal Page (pre–App Review)

Use Meta App **Development** mode with ADMIN users granted **App Role** on the SmartKorp Meta App. Test Pages (SMARTKORP `541846535686129`, SK Messenger `1137356672785125`) as internal assets — no public App Review required for internal smoke.

### 9.2 Local test

| Step | Approach |
|---|---|
| OAuth redirect | ngrok or Meta allowlisted `localhost` redirect (if configured) |
| Encryption | `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` in `.env.local` |
| Graph | `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` in env |
| Unit tests | Mock `fetch` for token exchange + `/me/accounts` |

### 9.3 Production internal smoke

1. ADMIN starts OAuth → Meta consent → callback 302.
2. Page list shows expected Pages.
3. Complete selection → `channel_credentials.ACCESS_TOKEN` SET (verify fingerprint only).
4. `POST .../health` → `READY`.
5. Outbound send from HubChat (worker `runtimeSource: db` when resolver on).
6. Inbound comment/DM still 200 (webhook unchanged in phase 1).
7. Manual Channel Settings path still works (regression).

### 9.4 Manual-token fallback preservation

`PATCH /api/channel-settings/facebook` + test-connection **must remain** until wizard GA. OAuth does not remove manual fields.

### 9.5 Rollback

| Layer | Rollback |
|---|---|
| Feature flag | `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` — hide wizard OAuth CTA |
| Credentials | Revert to `channel_settings` manual tokens + env sync |
| DB | `oauth_transactions` rows expire; no destructive rollback needed |
| Connection | Set status `REVOKED`; restore manual settings |

### 9.6 Regression gates

| Gate | Pass criteria |
|---|---|
| Facebook inbound webhook | 200; signature valid; FPC-2G self-comment still ignored |
| Facebook outbound | Send API success with DB token |
| FB-ECHO-1 | Messenger echo ingest when `message_echoes` subscribed |
| LINE | Unchanged — no OAuth routes affect LINE adapter |
| Instagram | Unchanged — separate provider; shared Meta app secret env only |
| Channel Settings | PATCH + test-connection still READY with manual tokens |

---

## Risks & blockers

| Risk | Mitigation |
|---|---|
| Inbound webhook still env-coupled | Document env sync until inbound tenant resolver (FB-OAUTH-1C) |
| Dual credential stores (`channel_settings` vs `channel_credentials`) | Bridge write on OAuth complete during transition |
| No CSRF today | Implement state + transaction binding in 1A implementation |
| `META_APP_ID` not in worker env schema | Add platform env validation at OAuth start |
| Meta App Review for customer self-serve | Internal App Role path first; review before multi-tenant GA |
| Webhook verify token global env | Per-tenant verify token deferred; align Meta subscription with env token |

---

## Implementation handoff

| Agent | Next work |
|---|---|
| **Agent A** | Migration `oauth_transactions`; implement §4 endpoints; server-side token exchange; encrypt persist; health transitions |
| **Agent B** | Wire `/dashboard/channel-connect` UI to §8 contracts; Page picker; poll session; preserve Channel Settings manual path |

**This PR:** contract only — **no runtime code, migrations, or dependency changes.**
