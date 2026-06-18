# Instagram OAuth — Consumer Migration Matrix (IG-AUTH-1A)

> **Status:** Architecture input only. No implementation.
> **Base master SHA:** `54f9389494e4038d4e63106c2ceb94ac332fafc2`
> **Official Meta sources checked:** 2026-06-18

---

## Consumer migration matrix

| Consumer | Current token/path | Target token/path | Endpoint/base URL change | Permission change | Identifier change | Migration risk | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DM text** | Page access token (`EA…`); `POST graph.facebook.com/{version}/{pageId}/messages` | Instagram User access token; `POST graph.instagram.com/{version}/{IG_ID}/messages` | **Yes** — host + path segment (`pageId` → `IG_ID`) | `instagram_manage_messages` → `instagram_business_manage_messages` | Recipient remains IGSID; sender identity = `IG_ID` not Page ID | **High** — adapter + resolver + queue binding | Per-connection `auth_family=LEGACY_PAGE_TOKEN`; feature flag |
| **DM image** | Same as DM text; attachment on `/{pageId}/messages` | Same as DM text on `graph.instagram.com/{IG_ID}/messages` | **Yes** | Same as DM text | Same | **High** — shares text path | Same as DM text |
| **Comment private reply** | Page token; `POST graph.facebook.com/{pageId}/messages` with `recipient.comment_id` | Instagram User token; `POST graph.instagram.com/{APP_USERS_IG_ID}/messages` with `recipient.comment_id` | **Yes** | Add/verify `instagram_business_manage_comments` | `APP_USERS_IG_ID` replaces Page ID in URL | **High** — eligibility gates unchanged but endpoint changes | Legacy adapter path per connection |
| **Source Post passthrough** | Webhook payload metadata (no token) | Same | **No** | N/A | Map webhook entry account → `channel_connection_id` | **Low** | N/A |
| **Source Post Graph enrichment** | Webhook: `GET graph.facebook.com/{mediaId}?fields=…` + Page token; Worker IG: **passthrough only** | `GET graph.instagram.com/{mediaId}?fields=…` + Instagram User token on webhook **and** worker | **Yes** — host + token family; **closes worker parity gap** (IG-AUTH-0 P1-7) | `instagram_business_basic` (+ comment/media fields TBD in implementation) | Media ID from webhook; token scoped to owning IG account | **Medium** — worker enrichment net-new for IG Login | Disable Graph enrichment; passthrough only |
| **Profile lookup** | `GET graph.facebook.com/{igsid}?fields=name,profile_pic` + Page token at webhook | Instagram User token; profile fields via Instagram Login Graph (`profile_picture_url` on `/me` for connected account; **IGSID customer profile endpoint to confirm in implementation**) | **Likely yes** | `instagram_business_basic` | IGSID mapping unchanged at conversation layer | **Medium** — App Review dependency | Webhook lookup off; stored snapshot only |
| **Test connection** | `channel_settings` DB only; `GET graph.facebook.com/{pageId}?fields=instagram_business_account{…}` | `resolveInstagramCredential(CONNECTION_TEST)` + `GET graph.instagram.com/me?fields=user_id,username,account_type` (+ capability probes) | **Yes** | Scope-based probes vs Page-link probe | Page ID probe → IG account identity probe | **High** — fixes test/runtime split (IG-AUTH-0 P1-4) | Legacy test path behind flag |
| **Webhook subscriptions** | Meta app + ENV verify/app secret; Page-linked or IG professional subscriptions | Same app-level auth; IG Login subscriptions tied to Instagram professional account (`user_id`) | **Partial** — subscription object may differ; signature verification unchanged | `instagram_business_*` webhook field permissions | Route ingress by `provider_instagram_account_id` | **Medium** — dual-delivery during migration | Keep legacy subscription active per tenant |
| **Token refresh** | **None** at runtime | Scheduled `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` | **Yes** — new subsystem | `instagram_business_basic` required for refresh | N/A | **High** — new failure modes; must classify terminal errors | Pause refresh job; manual re-auth |

---

## Endpoint reference (official)

### Current path (Facebook Login / Page token)

| Operation | Base URL | Auth | Official doc |
| --- | --- | --- | --- |
| Send DM | `graph.facebook.com/{pageId}/messages` | Page access token | [Messenger Platform Send Message](https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message) |
| Health / IG link check | `graph.facebook.com/{pageId}?fields=instagram_business_account{…}` | Page access token | HubChat `verifyInstagramChannelHealth` + Meta Page node |
| Profile (customer) | `graph.facebook.com/{igsid}?fields=name,profile_pic` | Page access token | HubChat `instagramAdapter.fetchUserProfile` |

### Target path (Instagram Login)

| Operation | Base URL | Auth | Official doc |
| --- | --- | --- | --- |
| Send DM | `graph.instagram.com/{IG_ID}/messages` | Instagram User access token | [Instagram Login Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) |
| Private reply | `graph.instagram.com/{APP_USERS_IG_ID}/messages` | Instagram User access token | [Instagram Login Private Replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies) |
| Account identity | `graph.instagram.com/me?fields=user_id,username` | Instagram User access token | [Get Started](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started) |
| Token exchange | `api.instagram.com/oauth/access_token` | App secret server-side | [Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login) |
| Long-lived exchange | `graph.instagram.com/access_token?grant_type=ig_exchange_token` | App secret + short-lived token | Business Login Step 3 |
| Refresh | `graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` | Long-lived access token | Business Login — Refresh |

---

## HubChat code touchpoints (future implementation map)

| Consumer | Current files | Migration class |
| --- | --- | --- |
| DM text/image | `instagramAdapter.ts`, `sendOutboundMessage.ts`, `createInstagramOutboundAdapterResolver.ts` | `NEEDS_ENDPOINT_CHANGE` + `NEEDS_RESOLVER_CHANGE` + `NEEDS_CONNECTION_BINDING_FIX` |
| Private reply | `instagramAdapter.sendPrivateReply`, `sendOutboundMessage.ts` | Same |
| Source Post | `instagramAdapter.fetchMediaDetailFromGraph`, `sourcePostIngestEnrichment.ts` | `NEEDS_ENDPOINT_CHANGE` + worker parity |
| Profile | `instagramAdapter.fetchUserProfile` | `NEEDS_TOKEN_FAMILY_DECISION` + App Review |
| Test connection | `testChannelConnection.ts`, `verifyInstagramChannelHealth` | `NEEDS_RESOLVER_CHANGE` |
| Webhook | `instagram.ts`, `facebook.ts`, `webhookSignature.ts` | `NEEDS_TOKEN_FAMILY_DECISION` (routing only) |
| Refresh | **None** | `NEEDS_REFRESH_REDESIGN` (new) |

---

## Non-negotiable migration constraints (from IG-AUTH-0)

| Constraint | Architecture response |
| --- | --- |
| DM text/image must not stop | Phase 4–5 canary per tenant; legacy path until exit criteria |
| Private reply must not stop | Phase 6 canary |
| Source Post enrichment must not regress | Phase 7; passthrough always on |
| Profile lookup must not regress | Phase 7; empty profile fallback preserved |
| Test ≠ runtime split | ADR-7 single resolver |
| Tenant/connection isolation | ADR-2 `channel_connection_id` required |
| Token expiry → infinite retry | Terminal `REAUTH_REQUIRED` + `classifyOutboundProviderFailure` extension |
| ENV fallback hides OAuth failure | `blockLegacyFallback` for OAuth-managed connections |

---

## Unknowns (missing evidence)

| Item | Missing evidence |
| --- | --- |
| Exact IGSID profile endpoint on `graph.instagram.com` for customer (not `/me`) | Implementation-phase Meta doc confirmation |
| Media field parity for Source Post on `graph.instagram.com/{mediaId}` | Field list validation against Instagram Login media reference |
| Production App Review status for `instagram_business_manage_messages` | Meta App Dashboard (not in repo) |
| Whether HubChat Meta app already has Instagram Login product configured | App Dashboard |
| Invalid-token error codes for terminal classification | Provider error catalog capture during Phase 2 |
