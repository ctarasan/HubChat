# Agent Report — FB-OAUTH-1A Facebook OAuth Long-Lived Page Connection Discovery & Contract

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-13 (reconciled with Agent B FB-OAUTH-1D 2026-06-15) |
| Phase | FB-OAUTH-1A — Discovery + implementation contract (**no runtime code in this PR**) |
| Related specs | CCP-0 (`docs/ccp-0-channel-connect-wizard-ux-spec.md`), CCP-1 foundation |
| Agent B UI spec | `docs/agent-reports/agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md` (branch `docs/fb-oauth-1d-ui-discovery-spec`) |
| Canonical production app | `https://smartkorp-hub-chat.vercel.app` |
| **Phase 1 UI route (locked)** | `/dashboard/channel-settings` |
| Facebook webhook callback | `POST /api/webhook/facebook` |

---

## Executive summary

| Area | Current (repository facts) | Proposed (FB-OAUTH-1A+) |
|---|---|---|
| Facebook connect UI | **Implemented** manual Channel Settings at `/dashboard/channel-settings` (`app/dashboard/channel-settings/page.tsx`, `src/ui/ChannelSettingsPage.tsx`) — ENABLED, write-only secrets, Test connection, READY/ERROR, ADMIN gate | **OAuth controls added to existing Facebook card** on same route (Phase 1 MVP) |
| Facebook OAuth UI | **Not implemented** — no OAuth buttons, page picker, or reconnect banner in `src/ui/` | Connect / reconnect / page selection wired to §4 APIs |
| `/dashboard/channel-connect` | **Spec only** (`docs/ccp-0-channel-connect-wizard-ux-spec.md`) — no runtime route | **Deferred**; optional future dedicated wizard surface |
| OAuth Page token storage | Manual path: `channel_settings.secret_json` (plaintext) | **Canonical:** encrypted `channel_credentials.ACCESS_TOKEN` only — **no dual-write** |
| Outbound runtime | `resolveFacebookOutboundConfig` → `channel_settings` when `DB_WITH_ENV_FALLBACK` | **Follow-up FB-OAUTH-1B:** activate `channel_credentials` via `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` + resolver |
| Inbound Graph enrichment | **Global env** `FACEBOOK_PAGE_ACCESS_TOKEN` (`src/interfaces/api/webhook/facebook.ts`) | **Separate follow-up FB-OAUTH-1C** — remains env-coupled after OAuth until inbound resolver ships |
| Meta OAuth API | **Not implemented** | §4 endpoints (ADMIN-only, token-free responses) |
| CSRF | **None** today | OAuth `state` + server-side transaction + HttpOnly resume cookie |

**Reconciled with Agent B:** Phase 1 UI stays on Channel Settings; callback redirects to `/dashboard/channel-settings?channel=facebook&oauth=…`; eight UI display states are **derived**, not DB enums.

---

## 1. Current UI and channel configuration (repository facts)

### 1.1 Channel Settings — implemented today

| Item | Path / evidence |
|---|---|
| Route | `app/dashboard/channel-settings/page.tsx` |
| Page component | `src/ui/ChannelSettingsPage.tsx` |
| Model / API helpers | `src/ui/channelSettingsModel.ts` |
| Nav | `src/ui/dashboardAppRailModel.ts` — `/dashboard/channel-settings`, ADMIN only |
| Facebook card | Shared loop; `data-testid="channel-settings-card-facebook"` |
| Manual fields | Page ID, account label, `page_access_token`, `app_secret`, `verify_token` (write-only SET/EMPTY) |
| Test connection | `POST /api/channel-settings/facebook/test-connection` |
| Status display | `NOT_CONFIGURED` \| `DISABLED` \| `READY` \| `ERROR` (`channelSettingsModel.ts`) |

**Only Facebook OAuth-specific UI is missing** (Connect button, page selector, reconnect banner, OAuth return handling).

### 1.2 `/dashboard/channel-connect` — not implemented

No `app/dashboard/channel-connect/` directory. CCP-0 wizard spec is design-only. **Phase 1 does not require this route.**

### 1.3 `channel_connections` + `channel_credentials` (CCP-1 foundation)

**Schema:** `supabase/migrations/20260604120000_ccp_1_channel_connection_foundation.sql`, `supabase/schema.sql`.

| `channel_connections` column | Facebook use |
|---|---|
| `provider_page_id` | Selected Page ID |
| `provider_account_name` | Page display name |
| `status` | Persisted `channel_connection_status` enum |
| `connected_at` / `connected_by` | OAuth completion attribution |
| `last_health_check_at` | Health check timestamp |
| `last_outbound_verified_at` / `last_inbound_verified_at` | Smoke timestamps |
| `last_error_code` | Safe enum/code (e.g. `PROVIDER_HEALTH_CHECK_FAILED`) |
| `last_error_message_safe` | Sanitized operator message |
| `webhook_active` | Subscription state |

| `channel_credentials` column | Facebook use |
|---|---|
| `credential_type` | `ACCESS_TOKEN` = Page token |
| `encrypted_secret_value` | AES-256-GCM (`src/lib/channelCredentialEncryption.ts`) |
| `token_expires_at` | Optional Page token expiry |
| `credential_state` | `EMPTY` \| `SET` \| `EXPIRED` \| `REVOKED` |

**Repository:** `src/infrastructure/adapters/repositories/supabaseChannelConnectionRepository.ts`.

### 1.4 `channel_settings` — legacy manual path (remains)

Plaintext `secret_json` (`page_access_token`, `app_secret`, `verify_token`). **Legacy/manual fallback only** after OAuth GA. OAuth-managed Page token **must not** be written here.

**APIs (unchanged):** `GET/PATCH /api/channel-settings`, `POST .../test-connection` — `requireAuth(req, ["ADMIN"])`.

### 1.5 Runtime resolution today

| Path | Token source |
|---|---|
| Outbound worker | `resolveFacebookOutboundConfig` — `channel_settings` first, env fallback (`src/lib/facebookOutboundRuntimeConfig.ts`) |
| Channel Connect resolver | `channel_credentials` when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (`src/application/channelConnect/channelConnectRuntimeResolver.ts`) — **production default OFF** |
| Inbound webhook Graph | **Env only** `FACEBOOK_PAGE_ACCESS_TOKEN` (`src/interfaces/api/webhook/facebook.ts`) |

### 1.6 Persisted connection status enum (DB — not UI display states)

`src/domain/channelConnections.ts`: `DRAFT`, `AUTHORIZING`, `CONNECTED`, `WEBHOOK_CONFIGURED`, `WEBHOOK_VERIFIED`, `INBOUND_VERIFIED`, `OUTBOUND_VERIFIED`, `READY`, `ERROR`, `RECONNECT_REQUIRED`, `REVOKED`.

`AUTHORIZING` exists; **no OAuth code sets it today** (`src/lib/channelConnectionLifecycle.ts`).

---

## 2. Credential source of truth (final decision)

| Rule | Decision |
|---|---|
| OAuth Page access token storage | **Only** `channel_credentials.encrypted_secret_value` (`ACCESS_TOKEN`) |
| Canonical active connection | `channel_connections` row for `(tenant_id, FACEBOOK)` |
| `channel_settings.secret_json` | **Legacy manual fallback** — operators may still PATCH manually; OAuth does **not** mirror token there |
| Env `FACEBOOK_PAGE_ACCESS_TOKEN` | **Legacy deployment fallback** — not updated by OAuth flow |
| Dual-write | **Forbidden** — OAuth complete must not write Page token to `channel_settings` or env |
| `CONNECTED` / `READY` claim | Do **not** report `connectionStatus` beyond `AUTHORIZING` until **FB-OAUTH-1B** enables runtime resolver + health check reads `channel_credentials` |
| Inbound Graph | **Remains env-coupled** until **FB-OAUTH-1C** inbound tenant token resolver — document in operator runbook |

### FB-OAUTH-1B runtime activation (implementation follow-up)

1. Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` for pilot tenant.
2. Extend `createFacebookOutboundAdapterResolver` / `channelConnectRuntimeResolver` to prefer `channel_credentials` for active `channel_connections` status ≥ `CONNECTED`.
3. Wire `POST /api/channel-connect/facebook/health` to Graph-check using decrypted `channel_credentials` token (same pattern as `verifyFacebookChannelHealth` but connection-scoped).
4. Worker logs `runtimeSource: channel_connect_db` when OAuth token used.
5. Manual `channel_settings` + env remain fallback when resolver misses.

---

## 3. OAuth API — final endpoint list

All routes: **ADMIN only** (`requireAuth(req, ["ADMIN"])`), tenant from `auth.tenantId`, responses **token-free**.

No repository routing constraint prevents these paths (Next.js App Router: `app/api/channel-connect/facebook/...`).

| # | Method | Path | Responsibility |
|---|---|---|---|
| 1 | `GET` | `/api/channel-connect/facebook/status` | Derived UI state + connection/health/oauth summary |
| 2 | `POST` | `/api/channel-connect/facebook/oauth/start` | Create transaction; return Meta `authorizeUrl` only |
| 3 | `GET` | `/api/channel-connect/facebook/oauth/callback` | Meta browser redirect; validate `state`; server-side code exchange; set resume cookie; 302 to UI |
| 4 | `GET` | `/api/channel-connect/facebook/oauth/session` | One-shot resume read via HttpOnly cookie |
| 5 | `GET` | `/api/channel-connect/facebook/pages` | Page list for active transaction (cookie-bound) |
| 6 | `POST` | `/api/channel-connect/facebook/complete` | Page selection → long-lived Page token → encrypt persist |
| 7 | `POST` | `/api/channel-connect/facebook/reconnect` | Revoke prior credential; new OAuth transaction |
| 8 | `POST` | `/api/channel-connect/facebook/health` | Graph health check; update `last_health_check_at`, status |

**Deferred (not Phase 1):** `POST /api/channel-connect/facebook/disconnect`.

**Canonical OAuth redirect URI (production):**

```
https://smartkorp-hub-chat.vercel.app/api/channel-connect/facebook/oauth/callback
```

**Manual fallback (preserved):** `PATCH /api/channel-settings/facebook` + `POST /api/channel-settings/facebook/test-connection` — unchanged.

---

## 4. Callback transport (final)

```text
UI (Channel Settings)
  → POST /oauth/start
  → window.location.assign(authorizeUrl)   // full-page redirect; no popup

Meta
  → GET /oauth/callback?code=…&state=…     // browser only; backend route

Backend callback handler
  → validate + consume state (single-use)
  → exchange code server-side (never log code/token)
  → store encrypted interim user token on oauth_transactions row
  → create short-lived resume session bound to transaction
  → Set-Cookie: HttpOnly; Secure; SameSite=Lax; Path=/api/channel-connect/facebook; Max-Age≤900
  → 302 redirect:
       success: /dashboard/channel-settings?channel=facebook&oauth=success
       error:   /dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=<ENUM>

UI on return
  → read oauth + errorCategory query only (never code/state/token)
  → GET /oauth/session once (cookie authenticates)
  → history.replaceState to strip query params
  → GET /status and/or GET /pages as needed
  → explicit POST /health when operator runs health check
```

**Forbidden in dashboard URL:** `code`, `state`, `access_token`, App Secret, raw Graph errors.

---

## 5. Page-selection session (final)

| Property | Rule |
|---|---|
| Storage | Server-side `oauth_transactions` row |
| Binding | `tenant_id` + `initiated_by_auth_user_id` + `initiated_by_sales_agent_id` |
| Resume | HttpOnly cookie `hubchat_fb_oauth_session` (name illustrative) — **not** `localStorage` / `sessionStorage` |
| Transaction ID in browser | **Not** stored in web storage; **not** required in query string after callback |
| Expiry | `expires_at` ≤ 15 minutes |
| Single-use | `state` consumed at callback; transaction `consumed_at` at `complete` |
| Access token to browser | **Never** — Page token only in `channel_credentials` after `complete` |

---

## 6. Status mapping (four layers — do not conflate)

### 6.1 Persisted `connectionStatus` (DB enum)

Value of `channel_connections.status`. Exposed as `connectionStatus` in API. **Not** the same as UI chip text.

### 6.2 `oauthStage` (transaction-only)

Value of `oauth_transactions.status`:

| `oauthStage` | Meaning |
|---|---|
| `PENDING` | Started; awaiting Meta redirect |
| `CALLBACK_RECEIVED` | Code exchanged; awaiting page selection |
| `PAGES_READY` | `/pages` can be served |
| `COMPLETED` | `complete` succeeded |
| `FAILED` | Terminal transaction error |
| `EXPIRED` | Past `expires_at` |

`null` when no active transaction.

### 6.3 `healthStatus` (token / Graph check result)

| `healthStatus` | Meaning |
|---|---|
| `UNKNOWN` | No health run yet |
| `OK` | Last health check passed |
| `DEGRADED` | Partial verification (e.g. outbound OK, webhook unverified) |
| `ERROR` | Health check failed |
| `RECONNECT_REQUIRED` | Token revoked/expired (e.g. Graph 190) |

Derived from `last_health_check_at`, `credential_state`, `last_error_code`, and smoke flags.

### 6.4 `displayState` (derived UI — Agent B eight states)

**Not a DB column.** Server derives for Agent B rendering on Channel Settings Facebook card:

| `displayState` | Typical derivation |
|---|---|
| `NOT_CONNECTED` | No connection row or `DRAFT` / `REVOKED`; manual not configured |
| `MANUAL_CONFIGURED` | `channel_settings.configured` && no active OAuth connection |
| `CONNECTING` | `oauthStage` ∈ `PENDING` or `connectionStatus=AUTHORIZING` before callback |
| `AWAITING_PAGE_SELECTION` | `oauthStage` ∈ `CALLBACK_RECEIVED`, `PAGES_READY` |
| `CONNECTED` | `connectionStatus` ≥ `CONNECTED` and < `READY`; `healthStatus` not ERROR |
| `DEGRADED` | `connectionStatus=READY` (or near) with `healthStatus=DEGRADED` |
| `NEEDS_RECONNECT` | `connectionStatus=RECONNECT_REQUIRED` or `healthStatus=RECONNECT_REQUIRED` |
| `ERROR` | `connectionStatus=ERROR` or `oauthStage=FAILED` |

### 6.5 Token-free status DTO (Agent B contract)

```typescript
type FacebookConnectStatusResponse = {
  data: {
    connectionId: string | null;
    connectionStatus: ChannelConnectionStatus | null; // persisted DB enum
    displayState: DisplayState; // derived — §6.4
    oauthStage: OAuthTransactionStage | null;
    healthStatus: HealthStatus;
    reconnectRequired: boolean;
    providerPageId: string | null;
    providerPageName: string | null;
    manualConfigured: boolean; // channel_settings.configured for FACEBOOK
    oauthAvailable: boolean; // META_APP_ID platform env present
    lastCheckedAt: string | null; // channel_connections.last_health_check_at
    lastVerifiedAt: string | null; // max(health, inbound/outbound verified)
    errorCategory: OAuthErrorCategory | null; // §9 — sanitized
    message: string | null; // sanitized operator text
    credentialState: { pageAccessToken: "EMPTY" | "SET" | "EXPIRED" | "REVOKED" };
  };
};
```

---

## 7. Data model and migration (final)

### 7.1 Required: `oauth_transactions`

Minimum new table for OAuth security contract:

| Column | Purpose |
|---|---|
| `id` | Internal UUID |
| `tenant_id` | Tenant binding |
| `connection_id` | FK `channel_connections` |
| `state_hash` | SHA-256 of OAuth `state` |
| `status` | `oauthStage` values |
| `initiated_by_auth_user_id` | ADMIN binding |
| `initiated_by_sales_agent_id` | ADMIN binding |
| `encrypted_user_token` | Interim user token (encrypted, short TTL) |
| `selected_page_id` | Set at `complete` |
| `error_category` | §9 enum |
| `expires_at` / `consumed_at` / `created_at` | Expiry + single-use |

Resume cookie maps to `oauth_transactions.id` server-side (opaque random cookie value → transaction lookup).

### 7.2 Where metadata lives (no over-claiming “zero migration”)

| Data | Storage | Notes |
|---|---|---|
| Page name | `channel_connections.provider_account_name` | Set at `complete` from Graph |
| Page ID | `channel_connections.provider_page_id` | Set at `complete` |
| Page `tasks` / scopes | **`oauth_transactions` JSONB `page_candidates_json`** or new `channel_connections.metadata_json` | **Not in schema today** — minimum: transaction JSONB during selection; persist selected tasks to `channel_connections.metadata_json` via **small migration** (`metadata_json jsonb default '{}'`) |
| `connected_at` | `channel_connections.connected_at` | **Exists** |
| `last_checked_at` | `channel_connections.last_health_check_at` | **Exists** |
| Last error category | `channel_connections.last_error_code` | **Exists** — use safe enum codes aligned with §9 |
| Sanitized error message | `channel_connections.last_error_message_safe` | **Exists** |
| Reconnect required timestamp | **Not in schema** — derive from `credential_state=REVOKED` + `status=RECONNECT_REQUIRED`; optional future `reconnect_required_at` |
| Token expiry | `channel_credentials.token_expires_at` | **Exists** |
| Granted scopes (long-lived) | **`channel_connections.metadata_json.grantedScopes`** | Requires `metadata_json` column if tasks/scopes must persist post-transaction |

**Migration summary:** `oauth_transactions` **required**; `channel_connections.metadata_json` **recommended minimum** for tasks/scopes persistence beyond transaction TTL.

---

## 8. API contracts for Agent B (token-free)

### 8.1 `POST /oauth/start`

**Request:** `{ reconnect?: boolean }`

**Response:**

```typescript
{ data: { authorizeUrl: string; expiresAt: string } }
```

No `transactionId` in response body (cookie set on callback, or Set-Cookie on start if needed).

### 8.2 `GET /oauth/session`

Authenticated by resume cookie. **One-shot** after callback (Phase 1 — no polling).

```typescript
{
  data: {
    oauthStage: OAuthTransactionStage;
    displayState: DisplayState;
    errorCategory: OAuthErrorCategory | null;
    message: string | null;
    expiresAt: string;
    pagesReady: boolean;
  };
}
```

### 8.3 `GET /pages`

Cookie-bound. No query `transactionId`.

```typescript
{
  data: {
    pages: Array<{
      pageId: string;
      name: string;
      tasks: string[];
      selectable: boolean;
      reasonCode: "MISSING_PAGE_TASKS" | null;
      alreadyConnected: boolean;
    }>;
  };
}
```

### 8.4 `POST /complete`

**Request:** `{ pageId: string }` — cookie-bound session.

**Response:**

```typescript
{
  data: {
    connectionId: string;
    connectionStatus: "CONNECTED";
    providerPageId: string;
    providerPageName: string;
    displayState: "CONNECTED";
    message: string;
  };
}
```

### 8.5 `POST /reconnect`

Same as `oauth/start` with `reconnect: true`; prior `ACCESS_TOKEN` → `REVOKED`.

### 8.6 `POST /health`

```typescript
{
  data: {
    ok: boolean;
    healthStatus: HealthStatus;
    connectionStatus: ChannelConnectionStatus;
    displayState: DisplayState;
    reconnectRequired: boolean;
    providerPageId: string | null;
    providerPageName: string | null;
    lastCheckedAt: string;
    errorCategory: OAuthErrorCategory | null;
    message: string | null;
  };
}
```

---

## 9. Error categories (stable, token-free)

| `errorCategory` | Operator-facing use |
|---|---|
| `ACCESS_DENIED` | Meta consent denied |
| `INVALID_OR_EXPIRED_STATE` | `state` mismatch or replay |
| `SESSION_EXPIRED` | Transaction/cookie past `expires_at` |
| `NO_PAGES` | `/me/accounts` empty |
| `MISSING_PAGE_TASKS` | Page lacks required tasks (e.g. `MESSAGING`) |
| `TOKEN_EXCHANGE_FAILED` | Code exchange or long-lived exchange failed |
| `PROVIDER_TEMPORARY` | Meta 5xx / rate limit |
| `RECONNECT_REQUIRED` | Graph 190 / revoked token |
| `UNKNOWN` | Sanitized fallback |

Map provider payloads via `sanitizeProviderErrorMessage` (`src/lib/sanitizeProviderError.ts`). Never return raw Graph JSON to UI.

---

## 10. Polling (Phase 1)

| Pattern | Phase 1 |
|---|---|
| After OAuth callback | **One** `GET /oauth/session` |
| Status refresh | Explicit `GET /status` on mount and after user actions |
| Health | Explicit `POST /health` when operator clicks Run health check |
| Background polling | **Not used** |

---

## 11. Scope, rollout, and phases (explicit separation)

| Phase | Scope | Delivers |
|---|---|---|
| **FB-OAUTH-1A** (this contract) | Discovery + API/UI contract | Docs only |
| **FB-OAUTH-1A impl** | OAuth endpoints + `oauth_transactions` + cookie session | Backend foundation |
| **FB-OAUTH-1B** | Runtime credential activation | Resolver reads `channel_credentials`; outbound health uses OAuth token |
| **FB-OAUTH-1B UI** (Agent B) | Channel Settings Facebook card OAuth UX | Connect, page picker, reconnect on `/dashboard/channel-settings` |
| **FB-OAUTH-1C** | Inbound Graph token resolver | Webhook/worker enrichment off env |
| **External rollout** | After Meta App Review | Customer self-serve OAuth (App Role internal test first) |

### Testing gates

| Gate | Phase |
|---|---|
| App Role internal Pages smoke | Before external rollout |
| Manual Channel Settings regression | Every phase |
| LINE / Instagram non-regression | Every phase |
| Facebook inbound webhook 200 + FPC-2G | Every phase |
| Facebook outbound + FB-ECHO-1 | After 1B activation |

### Rollback

| Layer | Action |
|---|---|
| Feature flag | `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` hides OAuth UI |
| Credentials | OAuth token `REVOKED`; manual `channel_settings` unchanged |
| Runtime | Disable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` → legacy path |

---

## 12. Security (unchanged + reconciled)

- `state`: cryptographically random, stored hashed, single-use.
- Code exchange: server-side only.
- Resume: HttpOnly cookie; no web storage.
- Logs: `tenant_id`, `oauthStage`, `errorCategory`, `result` enums only.
- CSRF: `state` validation on callback GET.

---

## 13. Remaining implementation risks

| Risk | Mitigation |
|---|---|
| Runtime not using `channel_credentials` until 1B | Do not show `READY` until health passes on OAuth token |
| Inbound Graph env-coupled until 1C | Operator runbook: env sync still needed for comment enrichment |
| `metadata_json` missing for tasks/scopes | Add minimum migration with 1A impl |
| No CSRF middleware globally | OAuth callback relies on `state` + cookie path scope |
| Meta App Review | Internal App Role testing first |
| Agent B prior spec assumed `/dashboard/channel-connect` | **Superseded for Phase 1** — use Channel Settings route per this contract |

---

## Implementation handoff

| Agent | Next work |
|---|---|
| **Agent A** | `oauth_transactions` (+ optional `metadata_json`) migration; §3 endpoints; cookie session; encrypt Page token to `channel_credentials` only |
| **Agent B** | Extend `ChannelSettingsPage.tsx` Facebook card per FB-OAUTH-1D; wire §8 DTOs; callback query strip + one-shot session |

**This PR:** docs-only — **no runtime code, migrations, or dependency changes.**
