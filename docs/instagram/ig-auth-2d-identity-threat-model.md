# IG-AUTH-2D — Identity Threat Model

Audit baseline: master `796affe` (post IG-AUTH-2C). **Pre-2D:** callback uses token-exchange `user_id` only; legacy Test Connection uses Facebook Page probe.

References: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md), [`ig-oauth-consumer-migration-matrix.md`](ig-oauth-consumer-migration-matrix.md), [`ig-oauth-safe-api-contract.md`](ig-oauth-safe-api-contract.md).

---

## Identity matrix

| Identifier | Meaning | Source (target 2D) | Storage | Public exposure | Must never be confused with |
| ---------- | ------- | -------------------- | ------- | --------------- | --------------------------- |
| Professional account ID (`user_id` / `provider_instagram_account_id`) | Connected IG Business/Creator account — webhook notification ID | `GET graph.instagram.com/me?fields=user_id,…` | `instagram_oauth_credentials.provider_instagram_account_id`; optional `channel_connections.provider_ig_account_id` | Masked ID only in operator DTO | IGSID, Facebook Page ID, PSID |
| `provider_user_id` | Meta user identity from token exchange — **verify semantic vs `/me` user_id`** | Token exchange response | `instagram_oauth_credentials.provider_user_id` | Internal only | IGSID; may equal professional ID for Business Login — document in 2D |
| IGSID | Instagram-scoped user ID for **messaging counterpart** | Webhook / conversation thread | `conversations.channel_thread_id` as `ig:user:<IGSID>`; contact identity | Internal routing only | Professional account ID |
| Username | Mutable display handle | `/me?fields=username` | Optional metadata; connection display name | Safe display (`@username`) | Canonical binding key |
| `account_type` | Professional eligibility signal | `/me?fields=account_type` | Not primary key; eligibility check only | Safe enum in test response | Permission grant |
| Facebook Page ID | Legacy Page-linked IG path | Legacy `channel_settings` / Page token | `channel_connections.provider_page_id`; legacy runtime | Internal / legacy label only | IG professional account ID |
| PSID | Facebook Messenger user ID | Facebook webhook | Facebook conversations | Internal | IGSID, IG IDs |

### Semantic flags on master (pre-2D)

| Item | Risk | 2D requirement |
| ---- | ---- | -------------- |
| `persistCredential` sets `providerInstagramAccountId` = `providerUserId` from exchange only | Token substitution / wrong account | `/me` verify before activate; compare IDs |
| `verifyInstagramChannelHealth` uses `graph.facebook.com/{pageId}` | Wrong identity plane for OAuth | OAuth test uses `graph.instagram.com/me` |
| Test Connection is tenant-global per channel | Cross-connection probe | `channelConnectionId` required |
| `provider_user_id` vs `provider_instagram_account_id` columns | Ambiguous semantics | Document and enforce equality rules |

---

## Threat matrix

| Threat | Example | Required control | Evidence target (Agent A PR) |
| ------ | ------- | ---------------- | ---------------------------- |
| Token substitution | Token belongs to another IG account | `/me` verify before activation; compare to exchange `user_id` if both present | Callback integration test |
| Account switch on reauth | Reconnect binds different professional account | Persisted `provider_instagram_account_id` equality; reject on mismatch | Reauth test |
| Username confusion | Username reused/changed | Professional account ID is canonical; username display-only | Username drift allowed test |
| ID type confusion | IGSID mistaken for account ID | Branded types / field names; no IGSID in credential row | Schema + code review |
| Cross-tenant probe | Test uses tenant A credential for tenant B | `tenantId` + `channelConnectionId` scope on all lookups | Wrong-tenant test |
| Legacy fallback | OAuth test fails → ENV Page token succeeds | Explicit no-fallback for OAuth path | Flag + resolver test |
| Connection switching | Test picks another active connection | Exact `channelConnectionId` binding | Wrong-connection test |
| Provider-response injection | Malformed `/me` JSON | Strict schema validation | Provider client test |
| Personal-account connection | Non-professional account accepted | `account_type` eligibility check | Unsupported account test |
| Token leak | Test logs expose token | No token in logs/errors/DTO; bounded HTTP client | Secret scan + DTO assert |
| Raw provider error leak | API returns Meta error body | Sanitized `errorCode` taxonomy | Route test |
| Test side effect | Test sends DM or mutates credential | Identity-only GET `/me`; no outbound adapter call | Side-effect audit |
| Permission overclaim | `/me` success ⇒ messaging ready | Limited readiness wording; no DM capability claim | DTO doc + tests |
| Profile scope creep | `profile_picture_url` stored/displayed | Discard or do not persist | Schema + DTO review |
| Feature-flag bypass | Test works while flag OFF | Backend flag gate on test route | Flag OFF test |
| Delivery activation | Test enables runtime/queue | Separate test vs runtime flags; no worker wiring | Regression test |

---

## Official provider-contract checklist (Agent A PR)

Agent A must cite official Meta docs for:

| Item | Expected (per architecture) |
| ---- | --------------------------- |
| Identity endpoint | `GET https://graph.instagram.com/{version}/me` |
| Host | `graph.instagram.com` — **not** `graph.facebook.com` for OAuth identity |
| API version | Project policy (`normalizeMetaGraphVersion` / env) |
| Permitted fields | `user_id`, `username`, `account_type` (minimum); no arbitrary client fields |
| Professional account ID | `user_id` in `/me` = webhook notification ID (ADR) |
| Account type values | Business/Creator eligible; personal rejected |
| Minimum permission | `instagram_business_basic` |
| Token transport | Query `access_token` or Bearer per official endpoint doc |
| Error schema | Strict parse; sanitize via `sanitizeProviderErrorMessage` |
| Expiry/revocation | Map to REAUTH_REQUIRED / retryable |

### Reject in review

- Instagram Basic Display assumptions
- Facebook Page token for OAuth identity test
- `graph.facebook.com` substitution for OAuth `/me`
- Messaging User Profile API (`/{igsid}`) for **own** professional identity
- Hard-coded version without project policy
- Client-supplied field list for `/me`

---

## Callback verification order (target)

```text
token exchange
→ long-lived token (existing 2C flow)
→ own-account identity GET /me
→ strict validation + account_type eligibility
→ ID comparison (exchange user_id vs /me user_id if both present)
→ compare with persisted ID on reauth
→ encrypted credential activation
→ state finalize CONSUMED
```

| Rule | Requirement |
| ---- | ----------- |
| Activation timing | Credential not ACTIVE before identity passes |
| Mismatch | Fail closed; no usable credential left |
| Identity failure | Finalize state FAILED; no token fallback |
| Raw response | Not persisted |
| Profile URL | Not persisted |
| Audit | Sanitized categories only |

### Reauthorization

| Rule | Requirement |
| ---- | ----------- |
| Same professional account | `provider_instagram_account_id` unchanged |
| Username drift | Allowed (update display metadata only) |
| Account ID change | Reject — `CONFIGURATION_ERROR` / account mismatch |
| Version guards | IG-AUTH-2A `activate` / `replaceAccessTokenAtomically` |
| Connection rebind | Forbidden — same `channel_connection_id` |

---

## Test Connection side-effect checklist

### Allowed

- [ ] Decrypt exact credential for bound connection
- [ ] GET own professional identity (`/me`)
- [ ] Compare identity to persisted credential
- [ ] Return sanitized status DTO
- [ ] Update sanitized last-check metadata (per existing health policy)

### Forbidden

- [ ] Send message / DM
- [ ] Create conversation
- [ ] Subscribe webhook
- [ ] Refresh token (`ig_refresh_token`)
- [ ] Activate or rotate credential
- [ ] Switch auth method
- [ ] Emit queue job
- [ ] Enable runtime/adapter path
- [ ] Auto-update `provider_instagram_account_id` without explicit reconnect policy
- [ ] Store `profile_picture_url`
- [ ] Delete legacy credential

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

## Status / error mapping (target)

| Condition | Expected classification |
| --------- | ----------------------- |
| Active valid identity | `READY` or limited identity-verified status |
| Expired/revoked token | `REAUTH_REQUIRED` |
| Missing credential | `CONFIGURATION_ERROR` |
| Permission missing | `CONFIGURATION_ERROR` |
| Non-professional account | `CONFIGURATION_ERROR` |
| Persisted ID mismatch | `CONFIGURATION_ERROR` / account mismatch code |
| Rate limit | Retryable / provider unavailable |
| Timeout / 5xx | Retryable / provider unavailable |
| Invalid response shape | Configuration / provider-contract error |
| Flag OFF | Controlled disabled response |

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

| Flag | Expected behavior |
| ---- | ----------------- |
| `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` | Gates OAuth Test Connection path only |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | Unchanged — does not auto-enable test |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | Stays OFF — no delivery |

Test flag must not open connect callback or worker/adapter selection.

---

## Current vs target (master → 2D)

| Area | Master today | 2D target |
| ---- | ------------ | --------- |
| Callback identity | Exchange `user_id` only | `/me` verify before activate |
| Test Connection | `verifyInstagramChannelHealth` (Facebook Page) | OAuth resolver + `/me` |
| Test scope | Tenant + channel | Tenant + `channelConnectionId` |
| Resolver | `resolveInstagramConnectionCredential` exists, unwired | Shared policy for test + future runtime |

---

## Deferred / operational (not 2D code)

- Production App Review for messaging scopes
- Live DM delivery cutover (IG-AUTH-2E+)
- Refresh scheduler (IG-AUTH-2H)
- Channel Settings OAuth UI card (may be 2D+ if in scope — default defer UI)
