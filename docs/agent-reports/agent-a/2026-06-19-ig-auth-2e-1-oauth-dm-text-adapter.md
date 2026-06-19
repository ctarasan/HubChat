# IG-AUTH-2E.1 OAuth DM Text Adapter Foundation

> **Agent:** A
> **Date:** 2026-06-19
> **Branch:** `feature/ig-auth-2e-1-oauth-dm-text-adapter`
> **Base master SHA:** `d4865e4ae969898707a683114a5979c765cc53b5`
> **Prior:** IG-AUTH-2E.0 outbound contract audit ([#248](https://github.com/ctarasan/HubChat/pull/248))

---

## Summary

IG-AUTH-2E.1 adds an **OAuth Instagram DM text delivery foundation** behind default-OFF flags. A new provider client posts text to `graph.instagram.com/{IG_ID}/messages` with Bearer auth. An application service resolves the exact OAuth credential via `resolveForDelivery` and sends text with no legacy/ENV/Page-token fallback.

**Worker, queue emission, and production cutover are not wired in this phase.**

---

## Official provider contract used

Source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (same as IG-AUTH-2E.0).

| Item | Contract |
| --- | --- |
| Host | `https://graph.instagram.com` |
| Endpoint | `POST /{version}/{IG_ID}/messages` |
| Token | `Authorization: Bearer <token>` (never in URL) |
| Recipient | `{ "id": "<IGSID>" }` |
| Text | `{ "message": { "text": "<TEXT>" } }` — max 1000 UTF-8 bytes |
| Success | `message_id`, optional `recipient_id` |
| Permissions | `instagram_business_basic`, `instagram_business_manage_messages` |

---

## Endpoint / ID semantics

| Decision | Choice |
| --- | --- |
| Endpoint selected | `/{professionalAccountId}/messages` using `provider_instagram_account_id` from resolved credential |
| Endpoint uncertainty | `/me/messages` also documented by Meta; HubChat uses explicit `/{IG_ID}/messages` for auditability (per 2E.0 recommendation). No silent `/me` guess without credential-bound ID. |
| Recipient | Numeric IGSID only (`InstagramMessagingScopedUserId`); usernames and sender professional account ID rejected |
| Sender | OAuth `providerInstagramAccountId` from exact `channel_connection_id` resolver output |

---

## Files changed

| File | Role |
| --- | --- |
| `src/infrastructure/adapters/meta/instagramOAuthMessagingClient.ts` | Provider client: payload builder, POST, response parser, error mapping |
| `src/application/instagramOAuth/instagramOAuthTextDelivery.ts` | Application service: flags, resolver, validation, send |
| `src/lib/instagramOAuthOutboundTextFlags.ts` | `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` gate |
| `src/lib/instagramOAuthTextDeliveryValidation.ts` | IGSID + text validation |
| `src/lib/instagramOAuthTextDeliveryErrors.ts` | Sanitized error taxonomy mapping |
| `src/domain/instagramIdentity.ts` | `asInstagramMessagingScopedUserId` |
| `*.test.ts` | Mocked provider + service tests; worker guard regression |

---

## Runtime feature flags

All default **OFF**. Outbound text requires all three:

| Flag | Purpose |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | Foundation gate |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | `resolveForDelivery` gate |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | Text send service gate (new in 2E.1) |

---

## Resolver behavior

Service calls existing `resolveForDelivery` with:

```text
tenantId + channelConnectionId (required, non-blank)
expectedAuthFamily = INSTAGRAM_BUSINESS_LOGIN
expectedDeliveryPath = DATABASE_ONLY
```

Allowed credential status: `ACTIVE`, `TOKEN_EXPIRING` (with valid expiry). Fail closed: `REAUTH_REQUIRED`, expired token, revoked/disconnected, missing credential, ambiguous config.

---

## No-fallback guarantees

The service does **not**:

- import or call legacy `InstagramAdapter`
- read ENV Page token
- use Facebook adapter
- select alternate `channel_connection_id`
- fall back when OAuth flags OFF or resolver fails

Worker `main.ts` does not import text delivery service (regression test).

---

## Text payload contract

Input:

```text
tenantId, channelConnectionId, conversationId,
recipientMessagingScopedUserId (numeric IGSID),
messageText, idempotencyKey
```

Output:

```text
externalMessageId, credentialId, channelConnectionId, recipientMessagingScopedUserId
```

---

## Error mapping

Sanitized codes: `OAUTH_RUNTIME_DISABLED`, `OAUTH_OUTBOUND_TEXT_DISABLED`, `CHANNEL_CONNECTION_REQUIRED`, `CREDENTIAL_NOT_FOUND`, `REAUTH_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `PERMISSION_MISSING`, `RECIPIENT_UNAVAILABLE`, `MESSAGE_WINDOW_CLOSED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_CONTRACT_ERROR`, `DELIVERY_FAILED_RETRYABLE`, `DELIVERY_FAILED_TERMINAL`, `CONFIGURATION_AMBIGUOUS`.

Never exposed: access token, Authorization header, ciphertext, raw provider body, recipient message text in public errors.

---

## Test coverage

- Provider client: endpoint, Bearer header, no URL token, payload shape, success parse, 401/429/5xx/window mapping, secret safety
- Service: flags OFF, missing connection, resolver matrix, recipient ID rules, no worker wiring
- Regression: legacy adapter unchanged, worker unchanged

---

## What remains deferred

- Image delivery (IG-AUTH-2E.2)
- Queue binding emission (IG-AUTH-2E.3)
- Worker production cutover (IG-AUTH-2E.3)
- OAuth UI
- Private replies (IG-AUTH-2F)
- Webhook migration
- Profile enrichment
- Refresh scheduler (IG-AUTH-2H)
- Legacy retirement (IG-AUTH-2I)
- Production flag-on
- Deployment / live Meta smoke

---

## Scope confirmation

IG-AUTH-2E.1 OAuth DM text adapter foundation only.
No image delivery.
No private reply.
No webhook/profile enrichment.
No OAuth UI.
No refresh scheduler.
No legacy retirement.
No production feature-flag or environment changes.
No production migration execution.
No deployment.
No live provider calls.
No production canary.
No merge performed in this phase.
