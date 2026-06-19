# Agent B — IG-AUTH-2E.2B OAuth DM Image Delivery Security Review Preparation

## Status

**Finalized** — docs aligned with merged implementation (PR #252 on master `a84cf78`). Ready for maintainer merge of PR #251.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2E.2-B |
| Date | 2026-06-19 (finalized 2026-06-19 post-merge) |
| Branch | `docs/ig-auth-2e-2b-image-security-review-prep` |
| Base master SHA | `a84cf78` (post PR #252 merge) |
| Implementation PR | [#252](https://github.com/ctarasan/HubChat/pull/252) — merged |
| Documentation PR | [#251](https://github.com/ctarasan/HubChat/pull/251) — open |
| Upstream foundation | IG-AUTH-2E.0 contract audit; IG-AUTH-2E.1 text adapter (PR #250); IG-AUTH-2A–2D credentials/resolver |
| Primary docs | [`ig-auth-2e-2-oauth-dm-image-review-checklist.md`](../../instagram/ig-auth-2e-2-oauth-dm-image-review-checklist.md), [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md), [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.2 merged on master adds an **OAuth Instagram DM image delivery foundation** behind default-OFF flags: provider client extension on `graph.instagram.com/{IG_ID}/messages` with Bearer auth, singular `message.attachment` direct HTTPS URL payload, application service using `resolveForDelivery` with exact `channelConnectionId`, URL/media validation, signed-URL masking, and strict IGSID recipient validation — with no legacy/ENV/Page-token fallback.

**Worker, queue emission, production cutover, and live Meta image send remain deferred** (IG-AUTH-2E.3+).

This prep package documents the independent-review criteria used for PR #252 and preserves the checklist for future 2E.3+ slices.

## Master baseline (post 2E.2)

| Merge | Content |
| --- | --- |
| #252 | OAuth DM image provider client + application service; outbound image flag |
| #250 | OAuth DM text provider client + application service |
| #249 | IG-AUTH-2E.1-B security review prep docs |
| #248 | IG-AUTH-2E.0 outbound contract audit |

Master HEAD: `a84cf78`. Production Instagram outbound path remains legacy until 2E.3 worker/queue wiring. All OAuth flags default OFF.

## Final implementation summary (merged PR #252)

| Item | Value |
| --- | --- |
| Provider client | `instagramOAuthMessagingClient.ts` — `sendImageMessage` on `POST graph.instagram.com/{version}/{IG_ID}/messages` |
| Token transport | `Authorization: Bearer` header only |
| Endpoint choice | `/{professionalAccountId}/messages` from `provider_instagram_account_id` (not `/me/messages`) |
| Image payload | `{ recipient: { id }, message: { attachment: { type: "image", payload: { url } } } }` |
| Application service | `instagramOAuthImageDelivery.ts` — flags, URL validation, resolver, send |
| URL validation | `instagramOAuthImageDeliveryValidation.ts` — HTTPS, host guard, MIME JPEG/PNG, declared size cap |
| Signed URL masking | `maskInstagramOAuthImageUrlForLog` — strips query/fragment/credentials |
| Resolver | `resolveForDelivery` with exact `tenantId` + `channelConnectionId`, `INSTAGRAM_BUSINESS_LOGIN`, `DATABASE_ONLY` |
| Recipient | Numeric IGSID; reuses `validateInstagramOAuthTextRecipient` |
| Outbound image flag | `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` — requires foundation + runtime + image |
| No-fallback | No legacy adapter, ENV Page token, Facebook adapter, text path, or alternate connection |
| Worker isolation | `worker/main.ts` does not import image delivery service |
| Server fetch | **None** — HubChat passes URL string; Meta fetches the image |

## Final implementation review evidence

| Field | Value |
|-------|-------|
| Implementation PR | #252 |
| Merged master SHA | `a84cf78c563c4d1427336dfa902dca1545d62942` |
| Pre-merge reviewed SHA | `16ca75bc74edb7e3f7361dbbc8c06dfc5aafdba5` |
| Review result | **PASS WITH NOTES** (independent implementation review) |
| Review comment | https://github.com/ctarasan/HubChat/pull/252#issuecomment-4748463640 |
| Test evidence | 2,230 tests pass; targeted image provider + service + URL validation tests |
| Security controls verified | Official endpoint, Bearer-only token, exact connection binding, ID semantics, URL validation boundary, signed-URL masking, fail-closed flags, no fallback, worker isolation |
| Post-merge doc alignment | **PASS** — this commit |

## Verified controls (PR #252)

- Fixed Instagram Login messaging endpoint on `graph.instagram.com`
- Bearer token transport; no query-string token
- Sender = connection-bound Instagram Professional Account ID
- Recipient = Instagram Messaging Scoped User ID (IGSID)
- Singular `message.attachment` with `type: "image"` and `payload.url` (direct HTTPS URL path)
- Exact `channel_connection_id` required for `resolveForDelivery`
- `INSTAGRAM_BUSINESS_LOGIN` and `DATABASE_ONLY` enforced
- Foundation + runtime + outbound image flags default OFF (triple gate)
- Image flag independent from text flag
- No legacy Instagram, Facebook, ENV, Page-token, text, private-reply, or alternate-connection fallback
- URL validation before resolver/provider call on invalid URL
- Signed URL query stripped from log masking; not in public errors
- Strict success response parsing (`message_id` required)
- Worker/outbox production path unchanged

## Known limitations (accurate wording)

| Topic | Merged behavior | Do not overclaim |
| --- | --- | --- |
| Remote file size | Validates `fileSizeBytes` when caller supplies declared metadata | Not remote content-length verification |
| Remote MIME | Validates declared `mediaMimeType` (JPEG/PNG only on OAuth path) | Not remote Content-Type verification |
| URL host guard | Reuses `isUnsafeMediaHost` (localhost, 127.x, RFC1918, `.local`) | Not complete SSRF prevention; link-local/IPv6 not covered |
| Profile/avatar block | Path-pattern heuristic on URL pathname | Defense-in-depth only; not identity-grade authorization |
| Server fetch | None in 2E.2 | Meta remains responsible for fetching the supplied URL |
| Payload shape | Singular `message.attachment` | Official single-image sample uses `attachments` key — **not live-validated** |
| Endpoint equivalence | Explicit `/{IG_ID}/messages` | `/me/messages` equivalence **not live-validated** |

## Official provider contract validation matrix

Source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19).

| Provider contract item | Expected | Merged implementation |
| --- | --- | --- |
| Host | `https://graph.instagram.com` only | **Verified** — `INSTAGRAM_GRAPH_HOST` |
| API version | Central config | **Verified** — `readInstagramOAuthServerConfig().graphVersion` |
| Send endpoint | `POST /{version}/{IG_ID}/messages` | **Verified** — explicit professional account ID path |
| Sender ID | Professional account ID from credential | **Verified** — `providerInstagramAccountId` |
| Recipient ID | IGSID | **Verified** — numeric validation; sender ID rejected as recipient |
| Image payload | Direct URL via attachment | **Verified** — singular `message.attachment.type=image`, `payload.url` |
| Token transport | Bearer header only | **Verified** — URL token guard |
| MIME | JPEG/PNG per official table | **Verified** — WEBP rejected at OAuth boundary |
| Size cap | 8MB Meta limit | **Verified** — declared `fileSizeBytes` when supplied |
| Success response | `message_id`, optional `recipient_id` | **Verified** — strict parse |
| Messaging window | 24-hour window | **Verified** — `MESSAGE_WINDOW_CLOSED` mapping |

## Endpoint decisions (post-review)

| Topic | Merged choice | Live confirmation |
| --- | --- | --- |
| `/me/messages` vs `/{IG_ID}/messages` | **`/{professionalAccountId}/messages`** | Deferred to provider smoke (2E.5+) |
| Single-image JSON key | **`message.attachment` singular** (aligned with audio/video/file on same doc page) | Deferred — official single-image sample uses `attachments` |
| Direct URL vs attachment_id | **Direct `payload.url` only** | Upload/attachment_id deferred |
| Multi-image `attachments[]` | Deferred | Out of 2E.2 scope |
| Caption on image | Deferred | No caption field in payload |
| `messaging_type` | Not sent | Not in Instagram Login samples |

## Production enablement boundary

PR #252 merge does **not** enable production OAuth DM image delivery.

| Item | Status on master |
|------|------------------|
| OAuth image provider/service code | Present |
| Outbound image feature flag | Default **OFF** |
| Worker/outbox routing | **Not wired** |
| Queue binding emission | **Not implemented** |
| Production env values | Not changed |
| Live Meta image send | Not performed |
| Private reply | Not implemented |
| Deployment/canary | Not performed |

OAuth DM image provider/application foundation merged. Worker/outbox integration, production enablement, and live Meta validation remain deferred.

## Remaining deferred work

| Phase | Scope |
| --- | --- |
| IG-AUTH-2E.3 | Queue exact connection binding + worker controlled OAuth routing |
| IG-AUTH-2E.4+ | Live provider smoke, staging, production canary |
| IG-AUTH-2E.7 | Production canary (explicit operator GO) |
| Later | Attachment upload / attachment_id, multi-image, caption policy |
| IG-AUTH-2F | Private reply OAuth path |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |
| Channel Settings OAuth UI | Operator connect UX |

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2e-2-oauth-dm-image-review-checklist.md`](../../instagram/ig-auth-2e-2-oauth-dm-image-review-checklist.md) | Verified checklist + production boundary |
| [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md) | Provider contract reference |
| Agent A report | [`2026-06-19-ig-auth-2e-2-oauth-dm-image-adapter.md`](../agent-a/2026-06-19-ig-auth-2e-2-oauth-dm-image-adapter.md) |

## Scope confirmation

Documentation alignment and final security evidence only. No source/runtime/test/schema/migration changes. No merge performed by Agent B.

## Verification

At commit: `git diff --check`, docs only, hidden/bidi scan, secret/signed-URL scan (placeholders only in examples).
