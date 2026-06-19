# IG-AUTH-2E.0 Outbound Messaging Contract Audit

> **Agent:** A
> **Date:** 2026-06-19
> **Branch:** `docs/ig-auth-2e-0-outbound-contract-audit`
> **Base master SHA:** `38b35a8db7d504341eee6b332e093c90c99b493e`
> **Prior phases:** IG-AUTH-2D merged ([#247](https://github.com/ctarasan/HubChat/pull/247)); review prep ([#246](https://github.com/ctarasan/HubChat/pull/246))

---

## Summary

IG-AUTH-2E.0 is a **docs/design gate only**. Current Instagram outbound delivery is **100% legacy**: Facebook Page access token + `graph.facebook.com/{pageId}/messages` with token in query string. OAuth credential resolver, queue binding contract, and identity types from IG-AUTH-2A–2D exist in code but are **not wired** to outbox emission, worker adapter selection, or provider send.

Cutover requires: (1) explicit `instagramCredentialBinding` on queue jobs, (2) worker route that refuses legacy/ENV for OAuth connections, (3) new OAuth adapter on `graph.instagram.com` with Bearer auth, (4) SQL/outbox changes to emit binding — all behind default-OFF flags.

**No runtime changes in this phase.**

---

## Current master baseline

| Merge | Content |
| --- | --- |
| #247 | Identity verification, OAuth Test Connection, discriminated routing, no legacy fallthrough on OAuth-managed test |
| #246 | IG-AUTH-2D security review prep |
| #243 | Connection-bound resolver + safe queue contract types |
| #242 | OAuth credential schema/repository |

Master HEAD: `38b35a8`. All OAuth delivery/runtime flags remain default OFF.

---

## Current legacy Instagram outbound flow

### Call-flow (text/image DM)

```text
UI / API
  POST /api/messages/send
    → requireAuth (SALES/MANAGER/ADMIN)
    → capability + conversation ownership checks
    → outboundCommandRepository.createOutboundMessageAndOutbox(...)
      → RPC create_outbound_message_with_outbox (supabase/schema.sql)
        → INSERT messages (PENDING external_message_id)
        → INSERT outbox_events topic=message.outbound.requested
    ← { messageId }

Outbox relay (worker/outboxRelayWorker.ts)
  → queue.enqueue("message.outbound.requested", payload)

Outbound worker (worker/outboundWorker.ts)
  → queue.claimBatch("message.outbound.requested")
  → SendOutboundMessageUseCase.execute(payload)

Send path (application/usecases/sendOutboundMessage.ts)
  → idempotency + rate limit
  → resolveOutboundAdapter(tenantId)  // Instagram: tenant-only, no channelConnectionId
  → validateInstagramDmOutbound
  → InstagramAdapter.sendMessage(...) OR sendPrivateReply (comment thread)

Legacy adapter (infrastructure/adapters/channels/instagramAdapter.ts)
  → extractInstagramRecipientIgsidFromThreadId("ig:user:{IGSID}")
  → assertLikelyGraphPageAccessToken (rejects IGA… tokens)
  → POST https://graph.facebook.com/{version}/{pageId}/messages?access_token={token}
  → body: { recipient: { id: IGSID }, message: { text } | attachment }
  → returns message_id → markSent(externalMessageId)

Terminal guard
  → outboundWorker marks queue DONE only when message delivery snapshot is terminal
```

### Key files

| Layer | File | Function / role |
| --- | --- | --- |
| API | `app/api/messages/send/route.ts` | Auth, validation, calls outbox RPC |
| Outbox RPC | `supabase/schema.sql` `create_outbound_message_with_outbox` | Message + outbox payload (no OAuth binding) |
| Relay | `worker/outboxRelayWorker.ts` | outbox → `queue_jobs` |
| Consumer | `worker/outboundWorker.ts` | Claims jobs, invokes use case |
| Use case | `application/usecases/sendOutboundMessage.ts` | Adapter resolve, send, markSent |
| Legacy resolver | `application/instagramOutbound/createInstagramOutboundAdapterResolver.ts` | Page token from channel_settings / ENV |
| Channel connect | `application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` | DB credential via `channel_credentials` (Page token) |
| Adapter | `infrastructure/adapters/channels/instagramAdapter.ts` | graph.facebook.com send |
| Worker boot | `worker/main.ts` | Wires legacy resolver; ENV_ONLY skips resolver |

### Side effects

- Creates `messages` row (OUTBOUND, external_message_id null until send)
- Updates conversation preview / timestamps
- Activity log `MESSAGE_SENT` with `queued: true`
- On success: `markSent`, lead status promotion, marketing event
- On failure: `markFailed`, queue retry/dead-letter per `outboundDeliveryError` classification

---

## Legacy Instagram dependency classification

| Dependency | Current use | OAuth path |
| --- | --- | --- |
| Facebook Page access token (`EA…`) | Required; validated in adapter | **MUST NOT USE** |
| Token in URL query (`access_token=`) | `postInstagramMessagesEndpoint` | **MUST NOT USE** — Bearer header only |
| `graph.facebook.com` host | All send/profile/media calls | **MUST NOT USE** — `graph.instagram.com` |
| Facebook Page ID in URL path | `/{pageId}/messages` | **MUST NOT USE** — `/{IG_ID}/messages` or `/me/messages` |
| `instagram_business_account` (health/test) | Legacy test connection probe | **MUST NOT USE** for OAuth delivery |
| IGSID recipient (`ig:user:{id}`) | Outbound DM target | **CAN SHARE** |
| `provider_external_user_id` on conversation | Inbound identity | **CAN SHARE** (same IGSID semantic) |
| `channel_settings` secrets | DB/ENV runtime config | **LEGACY ONLY** |
| `channel_credentials` Page token row | Channel-connect DB path | **LEGACY ONLY** for OAuth-managed connections |
| `DB_WITH_ENV_FALLBACK` | Worker Instagram runtime mode | **MUST NOT USE** when OAuth binding present |
| ENV `FACEBOOK_PAGE_ACCESS_TOKEN` | Worker fallback | **MUST NOT USE** for OAuth |
| `InstagramAdapter` class | Single implementation for legacy | **NEEDS SPLIT** — new OAuth adapter or strategy |
| Comment private reply (`recipient.comment_id`) | `sendPrivateReply` on Facebook Graph | **NEEDS SPLIT** — defer IG-AUTH-2F |
| Idempotency / queue retry | Shared infrastructure | **CAN SHARE** |
| `classifyOutboundProviderFailure` | Instagram window detection | **CAN SHARE** (extend taxonomy) |

### Critical invariant (unchanged from IG-AUTH-2D)

```text
OAuth outbound must never silently fall back to:
  Facebook Page token, Page ID, ENV credential,
  another channel connection, or legacy Instagram credential.
```

---

## Queue/outbox contract

### Current `OutboundMessageRequestedPayload` (domain/events.ts)

| Field | In outbox SQL? | Reliable for OAuth? |
| --- | --- | --- |
| `tenantId` | Yes | PRESENT AND RELIABLE |
| `messageId` | Yes | PRESENT AND RELIABLE |
| `conversationId` | Yes | PRESENT AND RELIABLE |
| `conversationIds` | Yes | PRESENT AND RELIABLE |
| `leadId` | Yes | PRESENT AND RELIABLE |
| `channel` | Yes | PRESENT AND RELIABLE |
| `channelThreadId` | Yes | PRESENT AND RELIABLE (IGSID in thread) |
| `content`, `messageType`, media fields | Yes | PRESENT AND RELIABLE |
| `instagramCredentialBinding` | **No** | MISSING at emission — TS type + zod only (IG-AUTH-2B) |

### Not on queue payload today

| Field | Source today | OAuth need |
| --- | --- | --- |
| `channel_connection_id` | `conversations.channel_connection_id` (nullable) | REQUIRED — must be on binding or payload |
| `auth_family` | `instagram_oauth_credentials.auth_family` | REQUIRED on CONNECTION_BOUND binding |
| `delivery_path` | Fixed `DATABASE_ONLY` for OAuth | REQUIRED on binding |
| Recipient IGSID | Derived from `channelThreadId` | DERIVABLE BUT RISKY if thread wrong |
| Professional account ID (sender) | `provider_instagram_account_id` on credential | From resolver only — never on queue |

### IG-AUTH-2B contract (already in repo)

`src/lib/instagramOAuthOutboundQueueContract.ts`:

- `CONNECTION_BOUND`: `{ mode, contractVersion: 1, provider: INSTAGRAM, authFamily: INSTAGRAM_BUSINESS_LOGIN, deliveryPath: DATABASE_ONLY, channelConnectionId }`
- `LEGACY`: `{ mode: "LEGACY" }`
- Prohibited fields: tokens, ciphertext, raw provider response, etc.

**Gap:** Nothing calls `serializeInstagramCredentialBindingForQueue` during outbox creation. RPC `create_outbound_message_with_outbox` has no binding parameter.

### Recommended decisions

| Question | Recommendation |
| --- | --- |
| OAuth job without `channel_connection_id`? | **Reject** at enqueue (API) or fail closed at worker before provider call |
| Legacy jobs without binding? | **Backwards-compatible** — treat absent binding as `{ mode: "LEGACY" }` |
| Worker heuristic? | **Forbidden** — route on explicit binding + connection auth family only |
| Retry/idempotency | Preserve existing `tenantId:messageId` idempotency; OAuth errors map to retryable/terminal without token mutation |

```text
Invariant: OAuth outbound delivery requires explicit channel_connection_id
on CONNECTION_BOUND binding. No exact connection_id = no OAuth delivery.
```

---

## Worker/adapter entrypoints

### Worker composition (`worker/main.ts`)

- `createInstagramOutboundAdapterResolver` when runtime mode ≠ `ENV_ONLY`
- Resolver uses `resolveInstagramWorkerOutboundConfig` → Page token + pageId
- **No** import of `resolveInstagramConnectionCredential` or OAuth credential repository
- Startup still registers `InstagramAdapter` from ENV Page token for registry fallback

### Adapter resolution in use case

```typescript
// sendOutboundMessage.ts — Instagram branch
instagramOutboundAdapterResolver.resolve(payload.tenantId)
// Facebook passes channelConnectionId; Instagram does not
```

### OAuth resolver (exists, not used for delivery)

`createInstagramConnectionCredentialResolver` → `resolveForDelivery`:

- Requires `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` + `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED`
- Input: `{ tenantId, channelConnectionId, expectedAuthFamily, expectedDeliveryPath }`
- Status: ACTIVE, TOKEN_EXPIRING OK; REAUTH_REQUIRED, REVOKED, etc. fail closed
- Decrypt via `instagramOAuthCredentialRepository.retrieveDecryptedMaterial`
- Returns `InstagramResolvedCredential` with OAuth token (IGA/long-lived user token)

**Readiness:** Resolver logic is sufficient for 2E.1 **after** worker wiring. Amendments needed:

1. Worker must pass `channelConnectionId` from queue binding (not tenant heuristic)
2. New adapter must accept OAuth token + professional account ID (not Page ID)
3. Separate adapter instance per job or per resolved credential (no tenant singleton cache of wrong token)

---

## Provider endpoint contract (official Meta)

Source: [Messaging — Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19).
Summary doc: [`docs/instagram/ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md)

| Item | Contract |
| --- | --- |
| Host | `graph.instagram.com` |
| Text/image endpoint | `POST /{IG_ID}/messages` or `POST /me/messages` |
| Token | Bearer header (Instagram user access token from Business Login) |
| Recipient | `{ "id": "<IGSID>" }` — Instagram-scoped ID from webhook |
| Sender ID | App user's Instagram **professional account ID** (`<IG_ID>`) |
| Text | `message.text`, max 1000 bytes UTF-8 |
| Image | `message.attachments[]` or `attachment` with `type: image`, `payload.url` HTTPS |
| Permissions | `instagram_business_basic`, `instagram_business_manage_messages` |
| Success | `message_id`, `recipient_id` |
| Window | 24-hour messaging window after user message |

### Ambiguities / NEEDS PROVIDER CONFIRMATION

| Topic | Notes |
| --- | --- |
| `/me/messages` vs `/{IG_ID}/messages` | Docs allow both; recommend `/{professionalAccountId}/messages` with ID from credential binding for explicit audit trail |
| Image payload shape | Docs show both `attachments` array and singular `attachment`; legacy HubChat uses singular on Facebook Graph — **validate against Instagram Login API in 2E.2** |
| OAuth token prefix | Legacy adapter rejects `IGA…`; OAuth adapter must accept Instagram Login tokens and **must not** use Page token validator |
| Rate limits | Docs mention messaging limits; exact QPS not fully specified in messaging page — treat 429 as retryable |
| Private reply endpoint | Not covered by same DM doc; legacy uses Facebook Graph — **defer 2F** |

---

## Text delivery design (IG-AUTH-2E.1 proposal)

### Input

```text
tenant_id, channel_connection_id, conversation_id,
channelThreadId (ig:user:{IGSID}), message text, idempotency key
Queue binding: CONNECTION_BOUND + DATABASE_ONLY + INSTAGRAM_BUSINESS_LOGIN
```

### Processing

1. Parse `instagramCredentialBinding` from queue payload
2. If `CONNECTION_BOUND`: `resolveForDelivery` with exact `channelConnectionId`
3. If runtime flag OFF → terminal `OAUTH_RUNTIME_DISABLED` (no legacy attempt)
4. If `LEGACY` or absent binding → existing legacy adapter path unchanged
5. Call `POST graph.instagram.com/{version}/{professionalAccountId}/messages` with Bearer token
6. Map `message_id` → `markSent`

### Output mapping

| Provider | Internal |
| --- | --- |
| `message_id` | `external_message_id` |
| HTTP 4xx/Graph error | Sanitized failure via extended taxonomy |
| 429 / 5xx | Retryable where policy allows |

---

## Image delivery design (IG-AUTH-2E.2 proposal)

### Existing HubChat image path

- API: `mediaUrl`, `previewUrl`, `mediaMimeType`, optional caption in `content`
- Upload: `/api/messages/upload-image` produces HTTPS URL (verify public fetchability)
- Validation: `validateInstagramOutboundImageMedia` — HTTPS, jpeg/png/webp, size cap
- Legacy send: single `message.attachment.type=image`, optional caption follow-up as second text message
- Signed URL expiry: **RISK** if worker delay exceeds URL TTL — document in 2E.2 tests

### OAuth design constraints

- Public HTTPS URL only (Meta fetches URL)
- Do not log full `mediaUrl` if query contains signed params (log mime + host only)
- Do not use profile/avatar URLs
- Separate code path from private reply image (2F)
- Optional finer flag: `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED`

---

## Identity / ID semantics

From IG-AUTH-2D (`src/domain/instagramIdentity.ts`):

| Type | Role in outbound |
| --- | --- |
| `InstagramProfessionalAccountId` | OAuth sender `<IG_ID>`; stored `provider_instagram_account_id` |
| `InstagramMessagingScopedUserId` | Recipient IGSID (from thread / webhook) |
| `InstagramOAuthProviderUserId` | Token exchange only; not recipient |
| Facebook Page ID | Legacy sender path only — **not OAuth** |

Recipient resolution order (unchanged): `extractInstagramRecipientIgsidFromThreadId(channelThreadId)` → must match `provider_external_user_id` where present.

---

## No-fallback invariants

| Scenario | Required behavior |
| --- | --- |
| CONNECTION_BOUND job + runtime flag OFF | Fail closed; no Page token attempt |
| CONNECTION_BOUND + missing binding fields | Fail closed `CONFIGURATION_AMBIGUOUS` |
| CONNECTION_BOUND + REAUTH_REQUIRED credential | Fail closed; no legacy |
| OAuth provider error | No retry on legacy path |
| Legacy job (LEGACY / no binding) | Unchanged legacy path |
| OAuth connection + legacy credential also present | Route by **binding mode**, not credential row heuristics |
| Worker DB resolver ambiguous connection | Existing fail-closed; OAuth must not widen match |

Evidence IG-AUTH-2D Test Connection: OAuth-managed + flag OFF returns DISABLED without legacy probe (pattern to mirror for delivery).

---

## Feature flag design

### Existing (all default OFF)

| Flag | Purpose |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | Schema/repository/resolver code paths |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | OAuth start/callback |
| `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` | Test Connection OAuth path |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | `resolveForDelivery` gate |

### Proposed for 2E (optional, additive)

| Flag | Purpose |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | Allow OAuth text send when runtime ON |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | Allow OAuth image send when runtime ON |

Rollout: code merged with all flags OFF; enable in non-prod first; optional tenant/connection allowlist in 2E.7; instant rollback = disable runtime/outbound flags without legacy regression.

---

## Error taxonomy (proposed for 2E)

| Code | Retry? | Credential status change? | Queue |
| --- | --- | --- | --- |
| `CREDENTIAL_NOT_FOUND` | No | No | Terminal |
| `REAUTH_REQUIRED` | No | Surface REAUTH | Terminal |
| `TOKEN_EXPIRED` / `TOKEN_REVOKED` | No | REAUTH path | Terminal |
| `PERMISSION_MISSING` | No | No | Terminal |
| `RECIPIENT_UNAVAILABLE` | No | No | Terminal |
| `MESSAGE_WINDOW_CLOSED` | No | No | Terminal (existing pattern) |
| `UNSUPPORTED_MEDIA` / `MEDIA_URL_INVALID` | No | No | Terminal |
| `RATE_LIMITED` | Yes | No | Retry with backoff |
| `PROVIDER_UNAVAILABLE` | Yes | No | Retry |
| `PROVIDER_CONTRACT_ERROR` | No | No | Terminal + alert |
| `DELIVERY_FAILED_RETRYABLE` | Yes | No | Retry |
| `DELIVERY_FAILED_TERMINAL` | No | No | Dead letter / DONE per policy |
| `CONFIGURATION_AMBIGUOUS` | No | No | Terminal |
| `OAUTH_RUNTIME_DISABLED` | No | No | Terminal (no legacy fallback) |

Secret safety: never expose token, Authorization, ciphertext, raw Graph body, or full IGSID in public API unless existing policy allows masked form.

---

## Test matrix (IG-AUTH-2E.1+)

### Unit

- OAuth text payload builder (host, path, Bearer, no query token)
- OAuth image payload builder (field allowlist)
- Resolver status matrix (ACTIVE, TOKEN_EXPIRING, REAUTH_REQUIRED, …)
- Provider error → taxonomy mapping
- Log/audit secret scans
- ID type separation tests (sender vs recipient)

### Integration

- CONNECTION_BOUND queue job → OAuth send (mocked Graph)
- Runtime flag OFF → fail closed, legacy adapter not called
- Missing `channelConnectionId` on binding → fail closed
- Legacy payload (no binding) → legacy adapter unchanged
- Ambiguous connection config → fail closed
- Identity mismatch N/A at send (already bound at connect)

### Worker regression

- Facebook / LINE outbound unchanged
- Legacy Instagram unchanged without binding
- Queue DONE only on terminal snapshot
- Idempotency preserved
- No raw provider body in job error preview

---

## Rollout plan (design only — not executed)

| Phase | Scope |
| --- | --- |
| **IG-AUTH-2E.1** | OAuth text adapter + unit tests; no worker wire |
| **IG-AUTH-2E.2** | OAuth image adapter + media URL policy tests |
| **IG-AUTH-2E.3** | Outbox/RPC emits binding; worker route selection; resolver wire |
| **IG-AUTH-2E.4** | Agent B security review |
| **IG-AUTH-2E.5** | Provider-mocked smoke |
| **IG-AUTH-2E.6** | Controlled staging (flags ON, non-prod) |
| **IG-AUTH-2E.7** | Production canary — explicit operator GO only |

**Deferred:** OAuth UI, private reply OAuth (2F), webhooks, profile enrichment, refresh scheduler (2H), legacy retirement (2I), live Meta smoke in this phase.

---

## Risks and open questions

1. **Outbox schema change** — `create_outbound_message_with_outbox` must accept/store `instagramCredentialBinding`; requires migration coordination (Agent B).
2. **Conversation binding gap** — `conversations.channel_connection_id` may be null for historical rows; OAuth send must fail closed or require backfill policy.
3. **Dual credential period** — Legacy Page token + OAuth credential on same connection must route by binding/auth family (same as Test Connection ambiguous rule).
4. **Token shape** — OAuth IGA/long-lived tokens vs Page EA tokens; separate adapter validation required.
5. **Image attachment schema** — Confirm exact JSON shape with Instagram Login API before 2E.2 cutover.
6. **Caption follow-up** — Legacy sends image then optional text as second request; OAuth design should preserve idempotency semantics (image delivered, caption fail = partial success policy already exists).
7. **ENV_ONLY worker mode** — OAuth delivery impossible in ENV_ONLY; document as unsupported for OAuth connections.

---

## Recommended next PRs

| PR | Title (suggested) | Scope |
| --- | --- | --- |
| 2E.1 | `feat(ig-auth): add OAuth Instagram text send adapter (mocked)` | New adapter module, no worker wire |
| 2E.2 | `feat(ig-auth): add OAuth Instagram image send adapter` | Image + media policy |
| 2E.3 | `feat(ig-auth): emit OAuth queue binding and wire worker route` | RPC + send path + resolver |
| 2E.4 | Agent B security review | — |
| 2E.5+ | Smoke, staging, canary | Operator-driven |

---

## Scope confirmation

IG-AUTH-2E.0 docs/audit/design only.
No source runtime implementation.
No worker/adapter behavior changes.
No queue emission changes.
No DB migration.
No production env/config changes.
No feature flag enablement.
No OAuth UI.
No webhook/private-reply/profile enrichment changes.
No refresh scheduler.
No legacy credential retirement.
No deployment.
No live provider calls.
No merge performed in this phase.
