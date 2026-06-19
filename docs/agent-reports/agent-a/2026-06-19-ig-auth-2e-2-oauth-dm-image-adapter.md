# IG-AUTH-2E.2 OAuth DM Image Adapter Foundation

> **Agent:** A
> **Date:** 2026-06-19
> **Branch:** `feature/ig-auth-2e-2-oauth-dm-image-adapter`
> **Base master SHA:** `f51c1ee218c02f57330fe69fa77451a7265b39e0`
> **Prior:** IG-AUTH-2E.1 OAuth text foundation ([#250](https://github.com/ctarasan/HubChat/pull/250), [#249](https://github.com/ctarasan/HubChat/pull/249))

---

## Summary

IG-AUTH-2E.2 adds **OAuth Instagram DM image delivery foundation** behind default-OFF flags. Extends the existing `instagramOAuthMessagingClient` with `sendImageMessage` using official Instagram Login direct HTTPS URL attachment shape. Application service `instagramOAuthImageDelivery` resolves exact OAuth credentials via `resolveForDelivery` with no legacy/ENV/Page-token fallback.

**Worker, queue emission, and production cutover are not wired.**

---

## Official provider contract

Source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (aligned with IG-AUTH-2E.0 audit).

| Item | Contract |
| --- | --- |
| Host | `https://graph.instagram.com` |
| Endpoint | `POST /{version}/{IG_ID}/messages` |
| Token | `Authorization: Bearer` header only |
| Recipient | `{ "id": "<IGSID>" }` |
| Image | Direct public HTTPS URL via `message.attachment.type=image`, `payload.url` |
| Formats | JPEG, PNG (official); WEBP rejected on OAuth path |
| Max size | 8MB (Meta URL attachment cap) |
| Permissions | `instagram_business_basic`, `instagram_business_manage_messages` |

---

## Endpoint decision and evidence

| Decision | Choice |
| --- | --- |
| Endpoint | `/{professionalAccountId}/messages` (same as 2E.1 text; explicit credential-bound sender ID) |
| Evidence | Official docs document `/{IG_ID}/messages` and `/me/messages`; HubChat uses explicit `/{IG_ID}/messages` per 2E.0/2E.1 audit trail |
| Remaining ambiguity | `/me/messages` equivalence not live-validated; deferred to provider smoke (2E.5+) |

---

## Image payload shape

```json
{
  "recipient": { "id": "<IGSID>" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": { "url": "<HTTPS_PUBLIC_URL>" }
    }
  }
}
```

No `messaging_type`, `comment_id`, or text fields on image payload.

---

## URL vs attachment-ID decision

| Path | 2E.2 status |
| --- | --- |
| Direct HTTPS URL (`payload.url`) | **Implemented** — minimal path per official Instagram Login docs |
| `message.attachments[]` multi-image | Deferred |
| Messenger/Page `message_attachments` upload + attachment_id | **Not used** — legacy Facebook Page contract |
| `is_reusable` upload flow | Deferred |

---

## ID semantics

| Role | Semantic |
| --- | --- |
| Sender | `providerInstagramAccountId` from exact `resolveForDelivery` |
| Recipient | Numeric IGSID only; usernames and sender professional account ID rejected |

---

## Media validation

`validateInstagramOAuthImageDeliveryMedia`:

- HTTPS only; rejects HTTP, data:, file:, javascript:
- Rejects localhost, loopback, private/link-local hosts
- Rejects embedded URL credentials
- Rejects profile/avatar/thumbnail URL patterns
- Bounded URL length (4096)
- MIME: JPEG/PNG only for OAuth path
- Size cap: 8MB Meta limit
- Signed URL query stripped from error/log masking via `maskInstagramOAuthImageUrlForLog`

No remote fetch in 2E.2.

---

## Feature flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | OFF | Foundation gate |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | OFF | Resolver gate |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | OFF | Image send service gate (new) |

Text flag does not enable image. Image flag does not enable text.

---

## Resolver and connection binding

Same as 2E.1:

```text
tenantId + channelConnectionId (required)
expectedAuthFamily = INSTAGRAM_BUSINESS_LOGIN
expectedDeliveryPath = DATABASE_ONLY
```

Credential states: ACTIVE, TOKEN_EXPIRING allowed; REAUTH_REQUIRED/expired/revoked/disconnected fail closed.

---

## No-fallback guarantees

Service does not call legacy `InstagramAdapter`, Facebook adapter, ENV Page token, or alternate connections. Invalid URL rejected before provider call.

---

## Error mapping

Codes include: `OAUTH_IMAGE_DISABLED`, `OAUTH_RUNTIME_DISABLED`, `CHANNEL_CONNECTION_REQUIRED`, `CREDENTIAL_NOT_FOUND`, `REAUTH_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `PERMISSION_MISSING`, `RECIPIENT_UNAVAILABLE`, `MESSAGE_WINDOW_CLOSED`, `IMAGE_URL_INVALID`, `UNSUPPORTED_MEDIA`, `MEDIA_TOO_LARGE`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_CONTRACT_ERROR`, `DELIVERY_FAILED_RETRYABLE`, `DELIVERY_FAILED_TERMINAL`, `CONFIGURATION_AMBIGUOUS`.

Never exposed: tokens, Authorization header, raw provider body, full signed URLs.

---

## Test evidence

- Flag isolation (text vs image)
- URL validation matrix (HTTPS, SSRF hosts, credentials, MIME, size, profile URLs)
- Provider client image payload + Bearer + error mapping
- Service fail-closed matrix + worker isolation guard
- Text foundation regression (unchanged module)

---

## Worker/outbox isolation

`worker/main.ts` does not import image delivery service (regression test). No queue/RPC/schema/API send route changes.

Queue still lacks `instagramCredentialBinding` emission — **deferred to IG-AUTH-2E.3**.

---

## Deferred work

- Queue binding emission + worker cutover (2E.3)
- Live Meta send / production flag-on
- Multi-image `attachments[]`
- Attachment-ID upload flow
- Caption follow-up policy
- Private reply (2F), webhooks, UI, refresh, legacy retirement, deployment

---

## Scope confirmation

IG-AUTH-2E.2 OAuth DM image adapter foundation only.
No worker/outbox cutover.
No queue emission or RPC/schema changes.
No production feature-flag or environment changes.
No live Meta calls or real image sends.
No private reply.
No webhook/profile enrichment.
No OAuth UI.
No refresh scheduler.
No legacy retirement.
No deployment.
No merge performed in this phase.
