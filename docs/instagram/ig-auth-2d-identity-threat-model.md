# IG-AUTH-2D — Identity Threat Model

Audit baseline: master `91ae0ef` (post IG-AUTH-2D merge, PR #247). **Implemented:** callback verifies `/me` before activation; OAuth Test Connection uses connection-bound resolver with discriminated routing.

References: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md), [`ig-oauth-consumer-migration-matrix.md`](ig-oauth-consumer-migration-matrix.md), [`ig-oauth-safe-api-contract.md`](ig-oauth-safe-api-contract.md).

---

## Identity matrix

| Identifier | Meaning | Source (2D merged) | Storage | Public exposure | Must never be confused with |
| ---------- | ------- | -------------------- | ------- | --------------- | --------------------------- |
| Professional account ID (`user_id` / `provider_instagram_account_id`) | Connected IG Business/Creator account — webhook notification ID | `GET graph.instagram.com/me?fields=user_id,…` | `instagram_oauth_credentials.provider_instagram_account_id`; optional `channel_connections.provider_ig_account_id` | Masked ID only in operator DTO | IGSID, Facebook Page ID, PSID |
| `provider_user_id` | Meta user identity from token exchange — compared to `/me user_id` | Token exchange response | `instagram_oauth_credentials.provider_user_id` | Internal only | IGSID |
| IGSID | Instagram-scoped user ID for **messaging counterpart** | Webhook / conversation thread | `conversations.channel_thread_id` as `ig:user:<IGSID>`; contact identity | Internal routing only | Professional account ID |
| Username | Mutable display handle | `/me?fields=username` | `verified_username`; connection display name | Safe display (`@username`) | Canonical binding key |
| `account_type` | Professional eligibility signal | `/me?fields=account_type` | `verified_account_type` | Safe enum in test response | Permission grant |
| Facebook Page ID | Legacy Page-linked IG path | Legacy `channel_settings` / Page token | `channel_connections.provider_page_id`; legacy runtime | Internal / legacy label only | IG professional account ID |
| PSID | Facebook Messenger user ID | Facebook webhook | Facebook conversations | Internal | IGSID, IG IDs |

### Semantic controls (merged — verified)

| Item | Control | Evidence |
| ---- | ------- | -------- |
| Credential activation | `/me` verify before activate; exchange `user_id` compared to `/me user_id` | `instagramOAuthConnectService.verifyProfessionalIdentity` |
| Blank token ID | Null/empty/whitespace token-response ID fails closed | `assertTokenResponseIdentityMatchesMe` |
| OAuth identity plane | `graph.instagram.com/me` with Bearer token | `instagramProfessionalIdentity.ts` |
| Legacy test path | Non-OAuth connections use Facebook Page probe unchanged | `verifyInstagramChannelHealth` |
| OAuth test routing | Discriminated `NOT_OAUTH_MANAGED` / `OAUTH_TEST_DISABLED` / `OAUTH_TEST_RESULT` | `instagramOAuthTestConnection.ts` |
| Flag OFF | OAuth-managed → explicit DISABLED; no legacy fallthrough | `testChannelConnection.instagramOAuth.test.ts` |
| Ambiguous config | Legacy + OAuth both configured → fail closed | `testChannelConnection.ts` |

---

## Threat matrix

| Threat | Example | Required control | Evidence (merged PR #247) |
| ------ | ------- | ---------------- | ------------------------- |
| Token substitution | Token belongs to another IG account | `/me` verify before activation; compare to exchange `user_id` | Callback integration test; identity mismatch test |
| Account switch on reauth | Reconnect binds different professional account | Persisted `provider_instagram_account_id` equality; reject on mismatch | `assertReauthorizationAccountBinding`; reauth switch test |
| Username confusion | Username reused/changed | Professional account ID is canonical; username display-only | Same-account reauth test |
| ID type confusion | IGSID mistaken for account ID | Branded types / field names; no IGSID in credential row | `instagramIdentity.ts` |
| Cross-tenant probe | Test uses tenant A credential for tenant B | `tenantId` + connection scope on all lookups | Resolver + route tests |
| Legacy fallback | OAuth test fails → ENV Page token succeeds | Explicit no-fallback for OAuth path | Flag OFF + ambiguous config tests |
| Connection switching | Test picks another active connection | Exact connection binding via resolver | `resolveForConnectionTest` |
| Provider-response injection | Malformed `/me` JSON | Strict schema validation | `validateInstagramProfessionalIdentityRaw` |
| Personal-account connection | Non-professional account accepted | `account_type` eligibility check | PERSONAL rejection test |
| Token leak | Test logs expose token | No token in logs/errors/DTO; bounded HTTP client | Audit forbidden keys; DTO assert |
| Raw provider error leak | API returns Meta error body | Sanitized `errorCode` taxonomy | `sanitizeProviderErrorMessage` |
| Test side effect | Test sends DM or mutates credential | Identity-only GET `/me`; no outbound adapter call | Side-effect audit; no health mutation on OAuth path |
| Permission overclaim | `/me` success ⇒ messaging ready | Limited readiness wording; no DM capability claim | Test message: "Messaging delivery is validated separately." |
| Profile scope creep | `profile_picture_url` stored/displayed | Not persisted | Schema + DTO review |
| Feature-flag bypass | Test works while flag OFF | Backend flag gate; explicit DISABLED for OAuth-managed | Flag OFF routing tests |
| Delivery activation | Test enables runtime/queue | Separate test vs runtime flags; no worker wiring | Regression test |

---

## Official provider-contract checklist (verified)

| Item | Implemented value |
| ---- | ----------------- |
| Identity endpoint | `GET https://graph.instagram.com/{version}/me` |
| Host | `graph.instagram.com` — not `graph.facebook.com` for OAuth identity |
| API version | Central config (`readInstagramOAuthServerConfig().graphVersion`) |
| Permitted fields | `user_id`, `username`, `account_type` (fixed allowlist) |
| Professional account ID | `user_id` in `/me` |
| Account type values | BUSINESS, CREATOR (MEDIA_CREATOR mapped); PERSONAL rejected |
| Token transport | Bearer header only |
| Error schema | Strict parse; sanitize via `sanitizeProviderErrorMessage` |
| Expiry/revocation | Map to REAUTH_REQUIRED / retryable |

---

## Callback verification order (merged)

```text
claim OAuth state
→ authorization-code exchange
→ long-lived token exchange
→ /me identity verification
→ token-response ID comparison
→ reauthorization account binding (when REAUTH_REQUIRED)
→ credential activation/token replacement
→ callback success
```

| Rule | Status |
| ---- | ------ |
| Activation timing | Credential not ACTIVE before identity passes — **Verified** |
| Mismatch | Fail closed; no usable credential left — **Verified** |
| Identity failure | Finalize state FAILED; no token fallback — **Verified** |
| Raw response | Not persisted — **Verified** |
| Profile URL | Not persisted — **Verified** |
| Audit | Sanitized categories only — **Verified** |

### Reauthorization (verified)

| Rule | Status |
| ---- | ------ |
| Same professional account | `provider_instagram_account_id` unchanged — **Verified** |
| Username drift | Allowed (update display metadata only) — **Verified** |
| Account ID change | Reject — `INSTAGRAM_OAUTH_ACCOUNT_SWITCH_REJECTED` — **Verified** |
| Version guards | IG-AUTH-2A `activate` / versioned update — **Verified** |
| Connection rebind | Forbidden — same `channel_connection_id` — **Verified** |

---

## Test Connection side-effect checklist

### Allowed (verified)

- [x] Decrypt exact credential for bound connection
- [x] GET own professional identity (`/me`)
- [x] Compare identity to persisted credential
- [x] Return sanitized status DTO

### Forbidden (verified absent)

- [x] Send message / DM
- [x] Create conversation
- [x] Subscribe webhook
- [x] Refresh token
- [x] Activate or rotate credential
- [x] Switch auth method
- [x] Emit queue job
- [x] Enable runtime/adapter path
- [x] Auto-update `provider_instagram_account_id` without explicit reconnect policy
- [x] Store `profile_picture_url`
- [x] Delete legacy credential
- [x] Legacy health update on OAuth test path

---

## Public-response exposure matrix

| Surface | Forbidden | Potentially allowed |
| ------- | --------- | ------------------- |
| Test Connection API JSON | accessToken, ciphertext, full provider response, credentialId, credentialVersion, full account ID, IGSID, client secret, raw error, profile_picture_url, permission payload | status, authMethod, checkedAt, username, accountType, masked account ID, sanitized errorCode |
| Channel Settings client | Same via `parseTestConnectionResponse` / forbidden patterns | Existing DTO merge only |
| Logs / audit | Token, ciphertext, full `/me` body | resultCode, connection context |
| Ops | Credential internals | Counts only |
| Test snapshots | Real tokens | Placeholder patterns |

Align with [`ig-oauth-safe-api-contract.md`](ig-oauth-safe-api-contract.md) `FORBIDDEN_LEAK_PATTERNS`.

---

## Status / error mapping (merged)

| Condition | Classification |
| --------- | -------------- |
| Active valid identity | `READY` (identity readiness only) |
| Expired/revoked token | `REAUTH_REQUIRED` |
| Missing credential | `NOT_CONFIGURED` / configuration error |
| Permission missing | Configuration error |
| Non-professional account | Configuration error |
| Persisted ID mismatch | `INSTAGRAM_OAUTH_IDENTITY_MISMATCH` → configuration error |
| Rate limit | Retryable / provider unavailable |
| Timeout / 5xx | Retryable / provider unavailable |
| Invalid response shape | Configuration / provider-contract error |
| OAuth test flag OFF (OAuth-managed) | `DISABLED` |
| Ambiguous legacy + OAuth config | Configuration error (fail closed) |

**Note:** `READY` on Test Connection means **identity readiness**, not end-to-end DM delivery certification.

---

## Permission / readiness boundary

Successful `/me` proves only:

```text
token authenticates
professional account identity is readable
identity matches configured connection (on test)
```

Does **not** prove: DM delivery, image delivery, private reply, webhooks, comments, Source Post, profile enrichment, refresh lifecycle.

---

## Feature flags and runtime boundary

| Flag | Behavior (merged) |
| ---- | ----------------- |
| `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` | Gates OAuth Test Connection path only; absent/blank/false/off = OFF |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | Unchanged — does not auto-enable test |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | Stays OFF — no delivery |

Test flag does not open connect callback or worker/adapter selection.

---

## Pre-2D vs merged (historical)

| Area | Pre-2D (master `796affe`) | Merged (PR #247) |
| ---- | ------------------------- | ---------------- |
| Callback identity | Exchange `user_id` only | `/me` verify before activate |
| Test Connection | `verifyInstagramChannelHealth` (Facebook Page) | OAuth resolver + `/me` for OAuth-managed |
| Test scope | Tenant + channel | Tenant + connection via resolver |
| Resolver | Existed, unwired to test | Shared policy via `resolveForConnectionTest` |
| Flag OFF routing | N/A (pre-implementation) | Explicit DISABLED; no legacy fallthrough |

---

## Final IG-AUTH-2D implementation review evidence

| Field | Value |
|-------|-------|
| Implementation PR | #247 |
| Merged status | merged |
| Final reviewed commit | `5735340` |
| Review result | PASS (delta review) |
| Delta review | `4dd8759` → `5735340` |
| Test evidence | 2,172/2,172 passed |
| Typecheck | PASS |
| Lint | PASS |
| Build | PASS |
| git diff --check | PASS |
| Hidden/bidi scan | PASS |
| Secret scan | PASS |

---

## Deferred / operational (not 2D code)

- Production App Review for messaging scopes
- Live DM delivery cutover (IG-AUTH-2E+)
- Refresh scheduler (IG-AUTH-2H)
- Channel Settings OAuth UI card
- Production Test Connection flag-on
- Production migration execution
- Deployment/live Meta smoke
- Legacy credential retirement

**IG-AUTH-2D merged code does not mean production enablement.**
