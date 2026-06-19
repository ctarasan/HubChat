# IG-AUTH-2D — Identity Verification and OAuth Test Connection

> **Agent:** A
> **Date:** 2026-06-21
> **Branch:** `feature/ig-auth-2d-identity-test-connection`
> **Base master SHA:** `796affef18779db877df18d1443dbbdb89dc8c43`

---

## Current Test Connection flow (pre-change)

| Step | Legacy Instagram |
| --- | --- |
| Route | `POST /api/channel-settings/[channel]/test-connection` |
| Auth | `requireAuth(req, ["ADMIN"])` — MANAGER/SALES denied |
| Use case | `TestChannelConnectionUseCase` |
| Probe | `verifyInstagramChannelHealth` → `graph.facebook.com/{pageId}?fields=instagram_business_account{...}` |
| Credential | `channel_settings` runtime via `getRuntimeConfigForConnectionTest` |
| Response | `ChannelTestConnectionResponseDto` (`ok`, `status`, `message`, `lastVerifiedAt`, `lastError`) |

Facebook OAuth-managed path already branches before legacy (`tryOAuthManagedFacebookRuntime`). Instagram OAuth path added with the same pattern.

---

## Official Meta docs checked

| Item | Value |
| --- | --- |
| Source | [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login) |
| Checked | 2026-06-21 |
| Identity endpoint | `GET https://graph.instagram.com/{version}/me` |
| Token transport | `Authorization: Bearer` header (no token in URL) |
| Fields requested | `user_id`, `username`, `account_type` |
| Long-lived exchange | Unchanged from IG-AUTH-2C (`ig_exchange_token`) |

`profile_picture_url` is intentionally excluded from persistence and public responses.

---

## Identity domain types

| Type | Semantic |
| --- | --- |
| `InstagramProfessionalAccountId` | `/me.user_id` — stored in `provider_instagram_account_id` |
| `InstagramOAuthProviderUserId` | OAuth code-exchange `user_id` — stored in `provider_user_id` |
| `InstagramMessagingScopedUserId` | Reserved; not populated by OAuth `/me` |
| `InstagramUsername` | Normalized display handle from `/me.username` |

Column rename deferred; comments/types document canonical mapping.

---

## Callback verification order

```text
claim state
→ exchange authorization code
→ exchange long-lived token
→ GET /me (professional identity)
→ compare token-response user_id with /me user_id
→ reauth: compare with persisted provider_instagram_account_id
→ activate encrypted credential with verified metadata
→ finalize state
```

Identity failure leaves no ACTIVE credential.

---

## Test Connection architecture

| Capability | Flag |
| --- | --- |
| `resolveForDelivery` | `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` |
| `resolveForConnectionTest` | `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` |

OAuth Test Connection:

1. Detect `auth_family = INSTAGRAM_BUSINESS_LOGIN` active credential (explicit, not heuristic)
2. Reject ambiguous legacy + OAuth configured connections
3. Resolve/decrypt connection-bound credential (no ENV fallback)
4. Call `/me` and compare with persisted professional account ID
5. Return existing `ChannelTestConnectionResponseDto`

---

## Permission parity limitation

Successful `/me` verifies professional account identity only. It does **not** prove DM delivery, private reply, webhook, or refresh readiness. Messaging parity remains IG-AUTH-2E+.

---

## Feature flags

| Flag | Default |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | OFF |
| `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` | OFF (new) |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | OFF |

---

## Runtime no-change evidence

- No worker/adapter wiring
- No OAuth queue emission
- No Channel Settings UI changes
- Legacy Instagram Test Connection unchanged when connection is not OAuth-managed
- OAuth-managed Instagram returns `DISABLED` when test flag is OFF (no legacy fallthrough)
- `worker/main.ts` regression test unchanged

---

## Independent review disposition

| Item | Detail |
| --- | --- |
| Reviewed commit | `4dd8759` |
| Verdict | CHANGES REQUESTED (Agent B independent review) |
| Routing finding | OAuth-managed Test Connection returned `null` when test flag OFF, allowing legacy `verifyAndPersist()` fallthrough |
| Test gaps | Missing routing regression, callback identity-mismatch integration, reauth account-switch integration, verification call-order, blank token-response ID hardening |
| Amendment | `tryInstagramOAuthTestConnection` now returns discriminated `NOT_OAUTH_MANAGED` / `OAUTH_TEST_DISABLED` / `OAUTH_TEST_RESULT`; OAuth-managed + flag OFF returns explicit `DISABLED` without legacy probe |
| Added tests | Use-case routing (flag absent/blank/false/off, legacy unchanged, ambiguous fail-closed); connect service (identity mismatch, reauth switch/same-account, call order); validation (blank token-response ID) |
| Scope | Backend amendment only; no UI, delivery, worker cutover, or production changes |
| Merge | Not performed |

---

## Deferred work

IG-AUTH-2E DM adapter, 2F private reply, 2G Source Post, 2H refresh, 2I rollout, OAuth UI, profile/avatar enrichment.

---

## Scope confirmation

Identity verification and OAuth Test Connection backend parity only.
No Channel Settings OAuth UI.
No Instagram message delivery.
No OAuth queue emission.
No worker/adapter runtime cutover.
No webhook or profile enrichment changes.
No refresh scheduler.
No legacy credential retirement.
No production environment or credential changes.
No production migration execution.
No deployment.
No merge performed.
