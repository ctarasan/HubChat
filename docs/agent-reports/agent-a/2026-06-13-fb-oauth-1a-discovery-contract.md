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

**Reconciled with Agent B:** Phase 1 UI stays on Channel Settings; callback redirects to `/dashboard/channel-settings?channel=facebook&oauth=…`; eight UI display states are **derived**, not DB enums. **Lifecycle locked:** callback success → `AWAITING_PAGE_SELECTION`; `POST /complete` success → `CONNECTING` (not `CONNECTED`); operational health validation success → `connectionStatus: READY`, `healthStatus: OK`, `displayState: CONNECTED` **only when all five readiness-blocking checks `PASS`**, including **`RUNTIME_TEST_CONNECTION`** (always required — no shortcut when resolver flag is off).

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
| Dual-write | **Forbidden** — OAuth `complete` must not write Page token to `channel_settings` or env |
| Post-`complete` persisted status | **`connectionStatus` stays `AUTHORIZING`** until operational validation passes — token persistence alone is **not** operational readiness |
| Post-`complete` UI | **`displayState: CONNECTING`** — **`complete` must not return `displayState: CONNECTED`** |
| Operational readiness | Only after `POST /health` passes **all five readiness-blocking checks** (§8.6.1) with status **`PASS`** → persisted `connectionStatus: READY`, `healthStatus: OK`, `displayState: CONNECTED` |
| Inbound Graph | **Remains env-coupled** until **FB-OAUTH-1C** inbound tenant token resolver — document in operator runbook |

### Post-`complete` lifecycle (locked)

After `POST /api/channel-connect/facebook/complete` succeeds:

| Layer | Value |
|---|---|
| Page token | Encrypted and persisted in `channel_credentials` (`ACCESS_TOKEN`) |
| Page metadata | Persisted on `channel_connections` (`provider_page_id`, `provider_account_name`, `connected_at`) |
| Persisted `connectionStatus` | **`AUTHORIZING`** (existing `channel_connection_status` enum — do not advance to `READY` here) |
| OAuth session `oauthStage` | **`COMPLETED`** |
| `healthStatus` | **`UNKNOWN`** (no operational check run yet) |
| Derived UI `displayState` | **`CONNECTING`** |
| `reconnectRequired` | **`false`** |

**Forbidden:** callback success alone, token persistence alone, or `complete` response must **not** imply UI `CONNECTED` or persisted `READY`.

`POST /complete` response is token-free and **must** use semantics equivalent to:

```json
{
  "connectionStatus": "AUTHORIZING",
  "oauthStage": "COMPLETED",
  "healthStatus": "UNKNOWN",
  "displayState": "CONNECTING",
  "reconnectRequired": false
}
```

### Operational readiness transition (locked)

Operational validation (`POST /api/channel-connect/facebook/health`) runs the **five readiness-blocking checks** (§8.6.1):

1. `CREDENTIAL_RESOLUTION` — Page token decrypts from encrypted `channel_credentials`; tenant + connection scope match.
2. `PAGE_ACCESS` — Graph Page access succeeds for `provider_page_id`.
3. `REQUIRED_TASKS` — Required Page tasks/permissions present (e.g. `MESSAGING`).
4. `GRAPH_API` — Provider Graph reachable.
5. **`RUNTIME_TEST_CONNECTION`** — Facebook runtime / Test Connection path uses the stored credential successfully. **Always required, readiness-blocking.** Must return **`PASS`** before the first transition to `READY` / UI `CONNECTED`. **No conditional waiver** when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` or before FB-OAUTH-1B activation completes.

**Phase 1 defines no optional health check codes.** All five checks above are readiness-blocking before first `READY`.

**Only after all five checks return `PASS`:**

| Layer | Value |
|---|---|
| Persisted `connectionStatus` | **`READY`** |
| `healthStatus` | **`OK`** |
| Derived UI `displayState` | **`CONNECTED`** |
| `reconnectRequired` | **`false`** |

### Pre-READY behavior (before first `READY` — locked)

Applies when the connection has **never** reached persisted `connectionStatus: READY`.

If **any** readiness-blocking check returns **`WARN`** or **`FAIL`**, and reconnect is **not** proven:

| Layer | Value |
|---|---|
| Persisted `connectionStatus` | **`AUTHORIZING`** (no transition to `READY`) |
| Derived UI `displayState` | **`CONNECTING`** (never `CONNECTED` or `DEGRADED`) |
| `healthStatus` | **`ERROR`** for blocking **`FAIL`**; **`DEGRADED`** or **`ERROR`** for blocking **`WARN`** — **never `OK`** |
| `errorCategory` | Most specific applicable §9 value; use **`UNKNOWN`** when failure is internal readiness unavailability and no more specific canonical category applies |

**When `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` or FB-OAUTH-1B runtime credential activation is not complete:**

`RUNTIME_TEST_CONNECTION` must return **`FAIL`** (preferred) or **`WARN`** that is **explicitly treated as readiness-blocking**. It must **never** be optional or non-blocking. Aggregation must **not** produce `READY`, `OK`, or `CONNECTED`.

**Forbidden before first `READY`:** advancing to `connectionStatus: READY`, `healthStatus: OK`, or `displayState: CONNECTED` when any readiness-blocking check is not `PASS`.

### Post-READY `DEGRADED` (future supplemental checks only)

After the connection has reached **`READY` at least once**, a future phase may add **supplemental optional** health check codes (not defined in Phase 1). Then:

| Layer | Value |
|---|---|
| Persisted `connectionStatus` | **`READY`** (required readiness remains valid) |
| `healthStatus` | **`DEGRADED`** |
| Derived UI `displayState` | **`DEGRADED`** |

**Phase 1:** no supplemental optional checks exist — a `WARN` on any of the five readiness-blocking checks is **blocking** and keeps the connection in pre-READY state (§ pre-READY above). Row E (§8.6.2) does **not** apply in Phase 1.

**If a required permission/token/Page-access check proves reconnect is necessary:**

| Layer | Value |
|---|---|
| Persisted `connectionStatus` | **`REVOKED`** or **`ERROR`** or **`RECONNECT_REQUIRED`** (use existing `channel_connection_status` enum — do not invent values) |
| `healthStatus` | **`RECONNECT_REQUIRED`** |
| `reconnectRequired` | **`true`** |
| Derived UI `displayState` | **`NEEDS_RECONNECT`** |

### FB-OAUTH-1B runtime activation (implementation follow-up)

1. Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` for pilot tenant — **required before `RUNTIME_TEST_CONNECTION` can `PASS`** and before first `READY`.
2. Extend `createFacebookOutboundAdapterResolver` / `channelConnectRuntimeResolver` to prefer `channel_credentials` for active `channel_connections` with `connectionStatus` ≥ `AUTHORIZING` and credential `SET`.
3. Wire `POST /api/channel-connect/facebook/health` to run §8.6 structured checks using decrypted `channel_credentials` (connection-scoped; same safety pattern as `verifyFacebookChannelHealth`).
4. Advance persisted `connectionStatus` to **`READY`** **only** when **all five** readiness-blocking checks return **`PASS`** (§8.6.2 row C). If resolver is off or runtime path unavailable, `RUNTIME_TEST_CONNECTION` **`FAIL`**/**blocking `WARN`** keeps status at **`AUTHORIZING`** / UI **`CONNECTING`**.
5. Worker logs `runtimeSource: channel_connect_db` when OAuth token used.
6. Manual `channel_settings` + env remain fallback when resolver misses — **does not satisfy** `RUNTIME_TEST_CONNECTION` for OAuth-managed connections.

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
| 6 | `POST` | `/api/channel-connect/facebook/complete` | Page selection → long-lived Page token → encrypt persist; **`connectionStatus` stays `AUTHORIZING`**; response **`displayState: CONNECTING`** |
| 7 | `POST` | `/api/channel-connect/facebook/reconnect` | Revoke prior credential; new OAuth transaction |
| 8 | `POST` | `/api/channel-connect/facebook/health` | Structured operational validation (§8.6); advance to `READY` / `CONNECTED` **only when all five readiness-blocking checks `PASS`** |

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

UI on return (callback success)
  → read oauth + errorCategory query only (never code/state/token)
  → GET /oauth/session once (cookie authenticates)
  → history.replaceState to strip query params
  → derived displayState: AWAITING_PAGE_SELECTION (oauthStage CALLBACK_RECEIVED / PAGES_READY)
  → GET /status and/or GET /pages as needed
  → POST /complete after page selection → displayState CONNECTING (not CONNECTED)
  → explicit POST /health when operator runs operational validation → CONNECTED only after all five readiness-blocking checks PASS (including RUNTIME_TEST_CONNECTION)
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

Value of `channel_connections.status`. Exposed as `connectionStatus` in API. **Not** the same as UI `displayState`.

**Repository enum** (`channel_connection_status`): `DRAFT`, `AUTHORIZING`, `CONNECTED`, `WEBHOOK_CONFIGURED`, `WEBHOOK_VERIFIED`, `INBOUND_VERIFIED`, `OUTBOUND_VERIFIED`, `READY`, `ERROR`, `RECONNECT_REQUIRED`, `REVOKED`.

**Phase 1 OAuth path (locked):** after `complete`, status stays **`AUTHORIZING`**; advances to **`READY`** only when **`POST /health`** returns all **five** readiness-blocking checks **`PASS`** (§8.6). Do **not** set persisted `CONNECTED` as a shortcut for UI `displayState: CONNECTED` — UI Connected requires `connectionStatus=READY` + `healthStatus=OK`.

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

### 6.3 `healthStatus` (operational validation result — not connection lifecycle)

**Canonical values:** `UNKNOWN`, `OK`, `DEGRADED`, `ERROR`, `RECONNECT_REQUIRED`.

**Do not use `READY` as `healthStatus`.** `READY` belongs only to persisted `connectionStatus` (`channel_connection_status` enum).

| `healthStatus` | Meaning |
|---|---|
| `UNKNOWN` | No health check performed yet (including immediately after `complete`) |
| `OK` | All **five readiness-blocking** checks returned **`PASS`** (§8.6.1) — only valid after first `READY` transition or at transition moment |
| `DEGRADED` | **Post-READY only:** required readiness remains valid; a **supplemental optional** check (future phase — **none in Phase 1**) returned `WARN`. **Before first `READY`:** blocking `WARN` on any readiness check → pre-READY state (`AUTHORIZING` / `CONNECTING`), not `DEGRADED` display |
| `ERROR` | Operational check failed; reconnect not proven. **Before first `READY`:** blocking `FAIL` or blocking `WARN` → `connectionStatus` stays `AUTHORIZING`, `displayState` stays `CONNECTING` |
| `RECONNECT_REQUIRED` | Revoked/invalid token or missing required access — reconnect proven |

Derived from structured `checks` (§8.6), `last_health_check_at`, `credential_state`, and persisted `connectionStatus`.

**Agent B reconciliation (operational success — all five checks `PASS`):** `connectionStatus: READY` + `healthStatus: OK` + `displayState: CONNECTED`.

**Agent B reconciliation (pre-READY failure — reconnect not proven):** `connectionStatus: AUTHORIZING` + `displayState: CONNECTING` + `healthStatus: ERROR` or `DEGRADED` (never `OK`).

### 6.4 `displayState` (derived UI — Agent B eight states)

**Not a DB column.** Server derives for Agent B rendering on Channel Settings Facebook card.

**Lifecycle mapping (locked):**

| Event | Typical `displayState` |
|---|---|
| OAuth callback success | `AWAITING_PAGE_SELECTION` |
| `POST /complete` success | `CONNECTING` |
| Pre-READY health check `WARN`/`FAIL` (reconnect not proven) | **`CONNECTING`** (stays — never `CONNECTED` or `DEGRADED`) |
| All five readiness-blocking checks `PASS` (first `READY`) | `CONNECTED` |
| Reconnect-required health result | `NEEDS_RECONNECT` |

| `displayState` | Derivation |
|---|---|
| `NOT_CONNECTED` | No connection row or `DRAFT` / `REVOKED`; manual not configured |
| `MANUAL_CONFIGURED` | `channel_settings.configured` && no active OAuth connection |
| `CONNECTING` | `oauthStage=PENDING`; **or** `oauthStage=COMPLETED` with `connectionStatus=AUTHORIZING`; **or** `connectionStatus=AUTHORIZING` before first `READY` (including `healthStatus` `UNKNOWN`, `ERROR`, or pre-READY `DEGRADED` — UI stays **Connecting** until all five checks `PASS`) |
| `AWAITING_PAGE_SELECTION` | `oauthStage` ∈ `CALLBACK_RECEIVED`, `PAGES_READY` (callback success — token not yet bound to Page) |
| `CONNECTED` | **`connectionStatus=READY` AND `healthStatus=OK`** — all five readiness-blocking checks passed |
| `DEGRADED` | **`connectionStatus=READY` AND `healthStatus=DEGRADED`** — **post-READY only** (supplemental optional check `WARN`; no Phase 1 optional checks) |
| `NEEDS_RECONNECT` | `connectionStatus` ∈ `RECONNECT_REQUIRED`, `REVOKED`, `ERROR` (reconnect path) **or** `healthStatus=RECONNECT_REQUIRED` with `reconnectRequired=true` |
| `ERROR` | `connectionStatus=ERROR` (non-reconnect terminal) **or** `healthStatus=ERROR` **when `connectionStatus=READY`** **or** `oauthStage=FAILED` |

**Forbidden:** `POST /complete` or callback success must **never** derive `displayState: CONNECTED`.

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

On callback success, **`displayState` must be `AWAITING_PAGE_SELECTION`** (not `CONNECTED`).

```typescript
{
  data: {
    oauthStage: OAuthTransactionStage; // CALLBACK_RECEIVED or PAGES_READY on success
    displayState: DisplayState; // AWAITING_PAGE_SELECTION on callback success
    errorCategory: OAuthErrorCategory | null; // §9 UPPER_SNAKE_CASE
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

**Side effects:** encrypt Page token to `channel_credentials`; persist Page metadata; set `connectionStatus=AUTHORIZING`; set `oauthStage=COMPLETED`; leave `healthStatus=UNKNOWN`.

**Response (token-free — must not return `displayState: CONNECTED`):**

```typescript
{
  data: {
    connectionId: string;
    connectionStatus: "AUTHORIZING";
    oauthStage: "COMPLETED";
    healthStatus: "UNKNOWN";
    displayState: "CONNECTING";
    reconnectRequired: false;
    providerPageId: string;
    providerPageName: string;
    message: string;
  };
}
```

**Agent B:** after `complete`, render **Connecting** state; prompt operator to run operational validation (`POST /health`) before showing **Connected**.

### 8.5 `POST /reconnect`

Same as `oauth/start` with `reconnect: true`; prior `ACCESS_TOKEN` → `REVOKED`.

### 8.6 `POST /health` — structured operational validation

Runs the five readiness-blocking checks (§8.6.1). Updates `last_health_check_at`, persisted `connectionStatus`, and derived fields. **Only this step** may advance `connectionStatus` to `READY` and `displayState` to `CONNECTED`, and **only when all five checks return `PASS`**.

**Response (token-free):**

```typescript
type HealthCheckCode =
  | "CREDENTIAL_RESOLUTION"
  | "PAGE_ACCESS"
  | "REQUIRED_TASKS"
  | "GRAPH_API"
  | "RUNTIME_TEST_CONNECTION";

type HealthCheckStatus = "PASS" | "WARN" | "FAIL";

type HealthCheck = {
  code: HealthCheckCode;
  status: HealthCheckStatus;
  message: string; // sanitized, token-free — e.g. "Stored credential resolved successfully"
};

{
  data: {
    healthStatus: HealthStatus; // UNKNOWN | OK | DEGRADED | ERROR | RECONNECT_REQUIRED
    reconnectRequired: boolean;
    connectionStatus: ChannelConnectionStatus; // READY only when all five checks PASS; otherwise AUTHORIZING (pre-READY)
    displayState: DisplayState;
    lastCheckedAt: string; // ISO — channel_connections.last_health_check_at
    errorCategory: OAuthErrorCategory | null; // §9 UPPER_SNAKE_CASE only
    message: string | null;
    checks: HealthCheck[];
  };
}
```

**Example check entry (token-free):**

```json
{
  "code": "CREDENTIAL_RESOLUTION",
  "status": "PASS",
  "message": "Stored credential resolved successfully"
}
```

**Forbidden in `checks`:** raw Graph responses, tokens, secret references, authorization codes, raw provider errors.

#### 8.6.1 Readiness-blocking check codes (Phase 1 — stable)

**Phase 1 defines exactly five readiness-blocking checks.** There are **no optional** health check codes in Phase 1. Every check below must return **`PASS`** before aggregation may produce `connectionStatus: READY`, `healthStatus: OK`, or `displayState: CONNECTED`.

| `code` | Readiness-blocking | Validates |
|---|---|---|
| `CREDENTIAL_RESOLUTION` | **Yes — always** | Page token decrypts from `channel_credentials`; tenant + connection scope match |
| `PAGE_ACCESS` | **Yes — always** | Graph Page access succeeds for `provider_page_id` |
| `REQUIRED_TASKS` | **Yes — always** | Required Page tasks/permissions present (e.g. `MESSAGING`) |
| `GRAPH_API` | **Yes — always** | Provider Graph reachable; transient failures map to `ERROR` / `PROVIDER_TEMPORARY` when reconnect not proven |
| `RUNTIME_TEST_CONNECTION` | **Yes — always** | Facebook runtime / Test Connection path uses stored credential from `channel_credentials` successfully |

**`RUNTIME_TEST_CONNECTION` rules (locked):**

- **Always required** and **readiness-blocking** — mandatory before the first transition to `READY` and before UI `CONNECTED`.
- Must return **`PASS`** for row C aggregation (§8.6.2). **No waiver** when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` or before FB-OAUTH-1B activation completes.
- When resolver is disabled or runtime activation is incomplete: return **`FAIL`** (preferred) or **`WARN`** treated as **readiness-blocking** — aggregation stays at pre-READY row B (`AUTHORIZING` / `CONNECTING`).
- **Never** optional or non-blocking in Phase 1.

#### 8.6.2 Aggregation semantics (locked)

| Row | Condition | `healthStatus` | Persisted `connectionStatus` | `displayState` | `reconnectRequired` | `errorCategory` |
|---|---|---|---|---|---|---|
| **A** | No checks performed yet | `UNKNOWN` | `AUTHORIZING` (post-complete) | `CONNECTING` | `false` | — |
| **B** | Before first `READY`: any readiness-blocking check **`WARN`** or **`FAIL`**; reconnect **not** proven | `DEGRADED` or `ERROR` (**never `OK`**) | **`AUTHORIZING`** — **no `READY` transition** | **`CONNECTING`** — **never `CONNECTED` or `DEGRADED`** | `false` | Most specific §9 value; **`UNKNOWN`** for internal readiness unavailability |
| **C** | **All five** readiness-blocking checks **`PASS`** | `OK` | **`READY`** | **`CONNECTED`** | `false` | — |
| **D** | Reconnect **proven** (revoked/invalid token or missing required access) | `RECONNECT_REQUIRED` | **`RECONNECT_REQUIRED`**, **`REVOKED`**, or **`ERROR`** per repository lifecycle rules | **`NEEDS_RECONNECT`** | **`true`** | **`RECONNECT_REQUIRED`** (or more specific §9 when applicable) |
| **E** | **After `READY` reached at least once:** required readiness still valid; **supplemental optional** check `WARN` (**future phase — not Phase 1**) | `DEGRADED` | **`READY`** | **`DEGRADED`** | `false` | — |

**Phase 1 constraints:**

- Row **B** applies to **`RUNTIME_TEST_CONNECTION`** `FAIL`/`WARN` when resolver is off — **not** row E.
- Row **E** does **not** apply in Phase 1 (no supplemental optional checks defined).
- Row **C** requires **`RUNTIME_TEST_CONNECTION: PASS`** — no exceptions.

---

## 9. Error categories (stable, token-free)

**Canonical API casing: `UPPER_SNAKE_CASE` only.** Agent B UI **must consume these exact string values** in callback query params, session DTOs, status DTOs, and health responses. Lowercase or lower_snake_case variants are **invalid** and must not be emitted by the API.

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
| `UNKNOWN` | Sanitized fallback; also used when pre-READY failure is internal readiness unavailability and no more specific canonical category applies |

**Closed set:** no other `errorCategory` values in Phase 1 API surfaces.

Callback error redirect example (valid):

```text
/dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=ACCESS_DENIED
```

**Invalid (must not be used):** `access_denied`, `AccessDenied`, `invalid_or_expired_state`.

Map provider payloads via `sanitizeProviderErrorMessage` (`src/lib/sanitizeProviderError.ts`). Never return raw Graph JSON to UI.

---

## 10. Polling (Phase 1)

| Pattern | Phase 1 |
|---|---|
| After OAuth callback | **One** `GET /oauth/session` |
| Status refresh | Explicit `GET /status` on mount and after user actions |
| Health | Explicit `POST /health` when operator clicks Run health check — **required** before UI shows `CONNECTED`; all **five** readiness-blocking checks must **`PASS`** |
| Background polling | **Not used** |

### Acceptance criteria (Agent B review — lifecycle + readiness gate)

| # | Criterion |
|---|---|
| AC-1 | OAuth callback success derives `displayState: AWAITING_PAGE_SELECTION` — not `CONNECTED` |
| AC-2 | `POST /complete` persists token + metadata; **`connectionStatus=AUTHORIZING`**, **`oauthStage=COMPLETED`**, **`healthStatus=UNKNOWN`**, **`displayState=CONNECTING`** |
| AC-3 | `POST /complete` response **must not** include `displayState: CONNECTED` or `connectionStatus: READY` |
| AC-4 | `POST /health` structured `checks` array present; token-free messages only |
| AC-5 | **All five** readiness-blocking checks **`PASS`** → `connectionStatus: READY`, `healthStatus: OK`, `displayState: CONNECTED` |
| AC-6 | Before first `READY`: any readiness-blocking check **`WARN`**/`FAIL` (reconnect not proven) → `connectionStatus: AUTHORIZING`, `displayState: CONNECTING`, `healthStatus` never `OK` — **no `READY`/`CONNECTED` transition** |
| AC-7 | `RUNTIME_TEST_CONNECTION` is **always** readiness-blocking; resolver off → **`FAIL`** or blocking **`WARN`** — never optional |
| AC-8 | Reconnect-proven failure → `healthStatus: RECONNECT_REQUIRED`, `displayState: NEEDS_RECONNECT`, `reconnectRequired: true` |
| AC-9 | `errorCategory` values are **UPPER_SNAKE_CASE** only; Agent B consumes exact enum strings |
| AC-10 | `healthStatus` never uses `READY`; `READY` is persisted `connectionStatus` only |
| AC-11 | Phase 1 defines **no optional** health check codes; row E (post-READY `DEGRADED`) is reserved for future supplemental checks only |

---

## 11. Scope, rollout, and phases (explicit separation)

| Phase | Scope | Delivers |
|---|---|---|
| **FB-OAUTH-1A** (this contract) | Discovery + API/UI contract | Docs only |
| **FB-OAUTH-1A impl** | OAuth endpoints + `oauth_transactions` + cookie session | Backend foundation |
| **FB-OAUTH-1B** | Runtime credential activation + operational validation | Resolver reads `channel_credentials`; `RUNTIME_TEST_CONNECTION` must `PASS`; `POST /health` advances to `READY` only when **all five** checks `PASS` |
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
| Facebook outbound + FB-ECHO-1 | After 1B activation + all five health checks `PASS` (`CONNECTED` gate) |

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
| UI shows `CONNECTED` before operational validation | **`complete` returns `CONNECTING` only**; Agent B must run `POST /health` before Connected chip; AC-1–AC-3 |
| Premature `READY` when resolver disabled | **`RUNTIME_TEST_CONNECTION` always readiness-blocking**; resolver off → `FAIL`/blocking `WARN` → row B (`AUTHORIZING`/`CONNECTING`); AC-6–AC-7 |
| Runtime not using `channel_credentials` until 1B | `RUNTIME_TEST_CONNECTION` must `PASS` using stored credential; manual `channel_settings` fallback does **not** satisfy OAuth readiness |
| Inbound Graph env-coupled until 1C | Operator runbook: env sync still needed for comment enrichment |
| `metadata_json` missing for tasks/scopes | Add minimum migration with 1A impl |
| No CSRF middleware globally | OAuth callback relies on `state` + cookie path scope |
| Meta App Review | Internal App Role testing first |
| Agent B prior spec assumed `/dashboard/channel-connect` | **Superseded for Phase 1** — use Channel Settings route per this contract |
| `healthStatus` conflated with `READY` | **`READY` is `connectionStatus` only**; health uses `OK` / `DEGRADED` / `ERROR` / `RECONNECT_REQUIRED` / `UNKNOWN` |
| Pre-READY `WARN` treated as `DEGRADED` display | Phase 1 has no optional checks; pre-READY `WARN`/`FAIL` → row B — UI stays **`CONNECTING`** |
| Lowercase `errorCategory` in UI fixtures | Reject invalid casing; API emits UPPER_SNAKE_CASE only (§9) |

---

## Implementation handoff

| Agent | Next work |
|---|---|
| **Agent A** | `oauth_transactions` (+ optional `metadata_json`) migration; §3 endpoints; cookie session; encrypt Page token to `channel_credentials` only |
| **Agent B** | Extend `ChannelSettingsPage.tsx` Facebook card per FB-OAUTH-1D; wire §8 DTOs; callback query strip + one-shot session; **never show Connected until `POST /health` returns all five checks `PASS` and `displayState: CONNECTED`**; show **Connecting** when pre-READY health fails (including resolver unavailable) |

**This PR:** docs-only — **no runtime code, migrations, or dependency changes.**
