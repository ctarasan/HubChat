# IG-AUTH-1A — Instagram OAuth Architecture ADRs

> **Status:** Architecture decision record (docs only). No implementation.
> **Base master SHA:** `54f9389494e4038d4e63106c2ceb94ac332fafc2` (IG-AUTH-0 + IG-AUTH-0B merged)
> **Audit baseline:** P0 **0**, P1 **8**, P2 **4** (IG-AUTH-0)
> **Official Meta sources checked:** 2026-06-18 (see end of document)

---

## Decision summary

| ADR | Decision |
| --- | --- |
| ADR-1 | **Primary auth family:** Instagram User access token from **Business Login for Instagram**. **Legacy:** Facebook Page access token for already-connected tenants during phased migration. **End state:** OAuth-managed Instagram connections use DB credentials only — no permanent ENV fallback. |
| ADR-2 | All runtime credentials resolve by **`tenant_id` + `channel_connection_id`**. Instagram outbound queue contract carries `channelConnectionId`. |
| ADR-3 | **Extended channel credential store** (`channel_connections` + `channel_credentials` + additive metadata). No plaintext tokens in metadata. Relax `unique (tenant_id, provider)` before multi-IG per tenant. |
| ADR-4 | Logical OAuth routes under `/api/channel-connections/instagram/oauth/*`; state via `oauth_transactions` pattern (Facebook parity). **PKCE not documented** for Business Login — do not assume until Meta documents it. |
| ADR-5 | Token lifecycle state machine with **access-token-only refresh** (`ig_refresh_token`); dedicated scheduled refresh owner; terminal `REAUTH_REQUIRED`. |
| ADR-6 | Canonical `resolveInstagramCredential({ tenantId, channelConnectionId, capability })`; OAuth-managed = DB only, fail closed. |
| ADR-7 | Test connection and worker share **same resolver + same `channel_connection_id`**. |
| ADR-8 | Consumer migration requires **host + identifier changes** for most Graph consumers — not token swap alone. |
| ADR-9 | Webhook signature remains **app-level**; tenant routing by provider Instagram account ID → `channel_connection_id`. Compatibility period on existing routes. |
| ADR-10 | Phased canary migration (Phases 0–11); no big-bang. |

---

## Target vs current — decision matrix

| Dimension | Current Facebook/Page-token path | Instagram Login target | Migration consequence |
| --- | --- | --- | --- |
| Facebook Page required | **Yes** — Page linked to IG Professional account; `provider_page_id` in health probe | **No** for Business Login primary path — IG professional account authenticates directly | Remove Page ID as primary identity for new connections; retain Page ID on legacy rows until retired |
| Token owner | Facebook **Page** (`EA…` Page access token) | Instagram **professional account** (Instagram User access token from Business Login) | New encrypted credential family; adapter must accept IG Login token family |
| Provider account identifier | `provider_page_id` + optional `provider_ig_account_id`; health via Page node `instagram_business_account` | `provider_instagram_account_id` (`user_id` from `GET graph.instagram.com/me?fields=user_id,username`) + app-scoped user id from token exchange | Rebind conversations/webhooks to IG account ID; update connection test |
| DM text | `POST graph.facebook.com/{version}/{pageId}/messages` + Page token + `instagram_manage_messages` (Messenger Platform) | `POST graph.instagram.com/{version}/{IG_ID}/messages` + Instagram User token + `instagram_business_manage_messages` | **New adapter endpoint host + path**; reject `IGA…` guard must invert for OAuth path |
| DM image | Same Page-token `/{pageId}/messages` attachment payload | Same shape on `graph.instagram.com/{IG_ID}/messages` | Same adapter branch; different base URL + token family |
| Comment private reply | `POST graph.facebook.com/{pageId}/messages` with `recipient.comment_id` + Page token | `POST graph.instagram.com/{APP_USERS_IG_ID}/messages` with `recipient.comment_id` + Instagram User token + `instagram_business_manage_comments` | Endpoint host change; scope name change |
| Source Post lookup (passthrough) | Webhook payload fields — token-independent | Same — webhook payload | Low risk if webhook subscription preserved |
| Source Post Graph enrichment | `GET graph.facebook.com/{mediaId}?fields=…` + Page token (webhook); worker IG branch has **no Graph fallback** | `GET graph.instagram.com/{mediaId}?fields=…` + Instagram User token (expected; confirm field parity in implementation phase) | Worker + webhook enrichment must use resolver-fed IG Login token |
| Profile lookup | `GET graph.facebook.com/{igsid}?fields=name,profile_pic` + Page token | `GET graph.instagram.com/me` for connected account; customer profile fields via IG Login Graph (confirm IGSID profile endpoint in implementation phase) | Resolver capability `PROFILE_LOOKUP`; App Review re-validation |
| Webhooks | ENV app secret + verify token; route-specific secret order; IG-on-FB delegate | Same **app-level** HMAC model; Instagram Login subscriptions use `graph.instagram.com` identity (`user_id` in notifications) per Meta webhooks doc | Map webhook entry IG account ID → `channel_connection_id`; compatibility on `/api/webhook/instagram` and `/api/webhook/facebook` |
| Permissions/App Review | `instagram_manage_messages`, Page tasks, Facebook Login permissions | `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, etc. | **New App Review submissions** — do not assume Facebook approvals transfer |
| Token expiry | Manual tokens; `token_expires_at` column exists but **not enforced** on send; no IG refresh consumer | Short-lived **1 hour**; long-lived **60 days**; refresh via `ig_refresh_token` (access-token refresh, not separate refresh token) | Mandatory refresh job + terminal `REAUTH_REQUIRED` + queue classification |
| Refresh | **None** for Instagram at runtime | `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` — token must be ≥24h old, valid, with `instagram_business_basic` granted | Dedicated refresh owner (ADR-5) |
| Disconnect/revoke | Manual clear secrets / disable channel | Explicit disconnect route; mark `REVOKED` / `reauth_required_at`; stop refresh job | New operator flow; no silent ENV takeover |
| Multi-connection support | Tenant-global IG resolver today (**P1**); schema `unique (tenant_id, provider)` blocks multi-IG | Per-connection credentials via `channel_connection_id` | Schema constraint relaxation + resolver binding (ADR-2) |
| Rollback path | `DB_WITH_ENV_FALLBACK` + manual `channel_settings` | Per-connection `auth_family=LEGACY_PAGE_TOKEN` flag; re-enable legacy resolver mode per tenant; keep OAuth rows read-only | Phase-gated; feature flags per connection |

**Official evidence (checked 2026-06-18):**

- Current messaging requirements: [Messenger Platform — Send a Message (Instagram)](https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message) — Page ID, Page access token, `instagram_manage_messages`.
- Target messaging: [Instagram API with Instagram Login — Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) — `graph.instagram.com`, `/<IG_ID>/messages`, Instagram User access token, `instagram_business_manage_messages`.
- Target private reply: [Instagram Login — Private Replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies).
- Target OAuth/token: [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login).
- Target identity: [Get Started (Instagram Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started) — `user_id` is webhook notification ID.
- Webhooks dual-path: [Instagram Platform Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks).

---

## ADR-1 — Authentication family

### Decision

**Primary (new connections):** Instagram User access token obtained via **Business Login for Instagram**.

**Legacy compatibility (migration window):** Facebook Page access token (`EA…`) for tenants already on Page-linked model until phased cutover per connection.

**End state:** OAuth-managed Instagram connections (`auth_family = INSTAGRAM_USER_OAUTH`) resolve credentials from encrypted `channel_credentials` only. ENV fallback is **blocked** (`blockLegacyFallback` equivalent).

### Rationale

Meta documents two Instagram Platform integrations:

1. **Instagram API with Facebook Login** — Page-linked; Page access token; `graph.facebook.com` (current HubChat path).
2. **Instagram API with Instagram Login** — Business Login; Instagram User access token; `graph.instagram.com` (target).

HubChat `instagramAdapter.ts` today **rejects** Instagram Login tokens (`IGA…`) and requires Page tokens — migration is an explicit auth-family change, not a credential-source swap alone.

### Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Stay on Page token + manual entry forever | Does not meet OAuth operator UX goals (IG-AUTH-0B); no refresh; test/runtime split |
| Instagram Login without Business Login scopes | Business Login is Meta's documented OAuth flow for professional accounts |
| Permanent ENV fallback for OAuth connections | Masks OAuth failures (IG-AUTH-0 P1-5); violates fail-closed goal |

---

## ADR-2 — Connection-bound credential ownership

### Binding keys

Every Instagram credential row MUST bind:

```text
tenant_id
channel_connection_id
provider = INSTAGRAM
auth_family ∈ { INSTAGRAM_USER_OAUTH, LEGACY_PAGE_TOKEN, LEGACY_MANUAL }
provider_instagram_account_id   -- IG professional account ID (webhook + Graph IG_ID)
provider_user_id                -- app-scoped user id from token exchange (where applicable)
provider_page_id                -- legacy only; nullable for OAuth-managed rows
```

### Queue contract (target)

```typescript
// Logical shape — not implemented in this deliverable
interface InstagramOutboundQueuePayload {
  tenantId: string;
  channelConnectionId: string;      // REQUIRED for OAuth-managed sends
  conversationId: string;
  messageId: string;
  deliveryMode: "DM_TEXT" | "DM_IMAGE" | "COMMENT_PRIVATE_REPLY";
}
```

**Policy:** When `channelConnectionId` is present, resolver MUST NOT fall back to tenant-global `channel_settings` or ENV.

### Historical queue jobs (missing `channel_connection_id`)

| Case | Resolution policy |
| --- | --- |
| Conversation has `channel_connection_id` | Use conversation binding |
| Conversation missing binding, tenant has exactly one READY IG connection | Bind to sole connection; emit metric `ig_outbound_legacy_binding_inferred` |
| Conversation missing binding, tenant has multiple IG connections | **Fail closed** (terminal) with `connection_binding_ambiguous` — do not guess |
| Pre-migration backlog during Phase 4+ | One-time backfill runbook maps conversations → connection by `provider_page_id` / IG account ID |

---

## ADR-3 — Credential schema model (logical only)

### Decision: extended channel credential store

Reuse **`channel_connections`** + **`channel_credentials`** + **`oauth_transactions`** (Facebook pattern). Add logical fields — implementation via additive migration in a future phase:

**`channel_connections` extensions (logical):**

```text
auth_family                    text enum
connection_health_status       text enum
credential_version             integer (optimistic locking)
granted_scopes                 text[] or jsonb (scope names only)
connected_by_sales_agent_id    uuid
revoked_at                     timestamptz
reauth_required_at             timestamptz
```

**`channel_credentials` extensions (logical):**

```text
access_token_ciphertext        existing encrypted_secret_value (ACCESS_TOKEN type)
token_type                     'bearer'
token_expires_at               existing column
refresh_eligible_at            timestamptz (now + 24h after issue per Meta)
last_refresh_at                timestamptz
last_refresh_status            enum SUCCESS | FAILED | SKIPPED
last_refresh_error_code        text (sanitized provider code)
```

**Do NOT use** existing `REFRESH_TOKEN` credential type as evidence of provider refresh tokens. Meta Instagram Login uses **long-lived access token refresh** only ([Business Login — Refresh a long-lived token](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)).

### Design constraints

| Concern | Approach |
| --- | --- |
| Encryption | `encryptChannelCredentialPlaintext` / `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` |
| Write-only API | Never return ciphertext; `secretState` / health metadata only |
| Optimistic locking | `credential_version` increment on atomic token replace |
| Duplicate callback | `oauth_transactions` state hash consume-once (Facebook parity) |
| Reconnect | New transaction; supersede prior `ACCESS_TOKEN` row atomically |
| Multi-IG per tenant | **Requires** dropping `unique (tenant_id, provider)` on `channel_connections` |
| Audit trail | `oauth_transactions` + `last_refresh_*` + connection status transitions; no raw token in logs |

### Rejected: dedicated OAuth credential table

Adds join complexity without benefit — Facebook OAuth already uses `channel_credentials`.

---

## ADR-4 — OAuth initiation and callback security

### Logical routes

| Route | Responsibility |
| --- | --- |
| `POST /api/channel-connections/instagram/oauth/start` | ADMIN only; create `oauth_transactions` row; return Business Login authorize URL |
| `GET /api/channel-connections/instagram/oauth/callback` | Validate state; exchange code; long-lived exchange; persist credential; update connection status |
| `POST /api/channel-connections/instagram/disconnect` | Revoke/mark REVOKED; clear refresh scheduling; optional Meta revoke if documented |
| `POST /api/channel-connections/instagram/reauthorize` | New OAuth transaction linked to existing `channel_connection_id` |

### OAuth state requirements

Mirror `facebookOAuthService.ts` / `oauth_transactions`:

| Property | Mechanism |
| --- | --- |
| Cryptographically random | `generateFacebookOAuthState()` equivalent for Instagram |
| One-time use | `consumeStateAtCallback` |
| Short expiration | Transaction TTL (recommend 15 minutes, match Facebook) |
| Bind tenant ID | `oauth_transactions.tenant_id` |
| Bind initiating ADMIN | `connected_by` / transaction actor |
| Bind intended connection | `connection_id` on transaction |
| Bind redirect destination | Allowlisted redirect URI only |
| Reject replay | State hash consumed; duplicate callback → safe error |
| Reject tenant/session mismatch | Verify auth context tenant matches transaction |

### PKCE

**Finding (2026-06-18):** [Business Login authorize parameters](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login) document `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `force_reauth`, `enable_fb_login` — **no `code_challenge` / PKCE parameters documented**.

**Decision:** Do not implement PKCE unless Meta documents support. Server-side code exchange with app secret remains required.

### Callback error handling

| Event | Operator-safe outcome |
| --- | --- |
| Denied authorization | Redirect with `oauth=error`; category `USER_DENIED` |
| Missing code | `INVALID_CALLBACK` |
| Invalid/expired state | `INVALID_OR_EXPIRED_STATE` |
| Duplicate callback | Idempotent success if connection already READY; else `DUPLICATE_CALLBACK` |
| Token exchange failure | `TOKEN_EXCHANGE_FAILED`; sanitized message |
| Account lookup failure | `ACCOUNT_LOOKUP_FAILED` |
| Scope mismatch | `PERMISSION_MISSING`; list missing scopes |
| Already-connected account (same tenant) | `ACCOUNT_ALREADY_CONNECTED` |
| Cross-tenant duplicate | **Reject** — unique provider account per platform |
| Success | Connection `CONNECTED` → health probes → `READY` |

---

## ADR-5 — Token exchange and lifecycle (summary)

See [`ig-oauth-token-lifecycle.md`](./ig-oauth-token-lifecycle.md) for full state machine.

| Meta fact | Value (official) |
| --- | --- |
| Short-lived token | **1 hour** (Business Login) |
| Long-lived token | **60 days** (`ig_exchange_token`) |
| Refresh | `ig_refresh_token`; existing token ≥ **24 hours** old; must be valid; requires `instagram_business_basic` |
| Refresh token type | **None** — refresh returns new access token |
| Expired beyond 60 days without refresh | Cannot refresh — re-auth required |

**Refresh owner:** Dedicated scheduled **token-maintenance job** (not per-outbound request).

---

## ADR-6 — Runtime resolver (summary)

```text
resolveInstagramCredential({
  tenantId,
  channelConnectionId,
  capability,           // DM_TEXT | DM_IMAGE | COMMENT_PRIVATE_REPLY | SOURCE_POST_LOOKUP | PROFILE_LOOKUP | CONNECTION_TEST
  allowLegacyDuringMigration?: boolean
})
```

**Returns (sanitized):**

```text
credentialHandle        // opaque internal reference for adapter
authFamily
providerAccountId       // IG professional account ID
channelConnectionId
expiresAt
healthStatus
source                  // OAUTH_DB | LEGACY_DB | LEGACY_ENV (only when allowLegacyDuringMigration)
```

**Policies:**

| Connection type | Policy |
| --- | --- |
| OAuth-managed | DB only; `blockLegacyFallback = true` |
| Legacy migration | Explicit `auth_family=LEGACY_*`; ENV fallback only when flag + observability metric |
| Missing connection | Fail closed |

---

## ADR-7 — Test connection / runtime parity (summary)

**Target:** `POST …/test-connection` calls `resolveInstagramCredential({ capability: CONNECTION_TEST, channelConnectionId })` — same resolver and connection binding as Railway worker.

**Structured statuses (sanitized API):** `READY`, `TOKEN_EXPIRING`, `REAUTH_REQUIRED`, `PERMISSION_MISSING`, `ACCOUNT_MISMATCH`, `REVOKED`, `PROVIDER_UNAVAILABLE`, `CONFIGURATION_ERROR`.

No raw token or provider JSON in response (IG-AUTH-0B write-only contract preserved).

---

## ADR-8 — Consumer migration (summary)

See [`ig-oauth-consumer-migration-matrix.md`](./ig-oauth-consumer-migration-matrix.md).

---

## ADR-9 — Webhook architecture

### Principles (unchanged from IG-AUTH-0)

```text
Webhook signature authentication → app-level (ENV app secret)
Tenant/channel routing         → provider Instagram account ID
Access tokens                  → connection-level (per channel_connection_id)
```

### Instagram Login migration

| Topic | Decision |
| --- | --- |
| Routes | **Compatibility period:** keep `/api/webhook/instagram` and `/api/webhook/facebook` (IG delegate). No new canonical public route until Phase 7+ evaluation. |
| App secret selection | Route-specific order preserved; document which Meta app IDs map to which route |
| Verify token | ENV platform verify token (unchanged) |
| Subscription ownership | Per Instagram professional account via Meta App Dashboard + connection record |
| Provider → connection map | Index `channel_connections.provider_instagram_account_id` → `channel_connection_id` |
| Duplicate events | Idempotency keys on ingress (existing pattern) |
| Dual delivery during migration | Accept events for both legacy Page-linked and IG Login subscriptions until Phase 10 |
| Signature before routing | Unchanged — 401 on bad signature before tenant header processing |

Shared app secret remains **P1 architecture alignment**, not P0 tenant bypass (IG-AUTH-0 baseline).

---

## ADR-10 — Migration and rollback (summary)

See [`ig-oauth-rollout-rollback-plan.md`](./ig-oauth-rollout-rollback-plan.md).

---

## Official Meta sources checked (2026-06-18)

| Topic | URL |
| --- | --- |
| Business Login for Instagram | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login |
| Get Started (Instagram Login) | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started |
| Instagram API with Facebook Login | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login |
| Instagram Login Messaging API | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/ |
| Instagram Login Private Replies | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies |
| Messenger Platform Send Message (current) | https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message |
| Instagram Platform Webhooks | https://developers.facebook.com/docs/instagram-platform/webhooks |
