# IG-AUTH-2E.3 Worker/Queue Exact Connection Binding

> **Agent:** A  
> **Date:** 2026-06-19  
> **Branch:** `feature/ig-auth-2e-3-worker-queue-binding`  
> **Base master SHA:** `bac34bc51fb4c9eb9ea62b09a8f904a92576b49d`  
> **Prior phases:** IG-AUTH-2E.1 + 2E.2 merged (OAuth text/image application services)

---

## Summary

IG-AUTH-2E.3 wires outbound enqueue → outbox RPC → worker → OAuth text/image application services with an immutable, connection-bound queue snapshot. OAuth-managed Instagram DM jobs persist `instagramCredentialBinding` on the outbox payload; the worker routes deterministically to OAuth services when all required flags are ON, or fails closed when binding is present but routing is disabled. Legacy Instagram jobs without binding continue through the existing Page-token adapter unchanged.

All runtime flags remain default OFF. No production env changes, migration execution, deployment, or live Meta calls.

---

## Previous queue/worker flow

```text
POST /api/messages/send
  → createOutboundMessageAndOutbox (no binding)
  → RPC create_outbound_message_with_outbox
  → outbox relay → queue
  → SendOutboundMessageUseCase
  → instagramOutboundAdapterResolver (tenant-only, legacy Page token)
```

---

## Binding contract

Version **1** (`contractVersion: 1`), serialized as `instagramCredentialBinding` on outbox payload:

| Field | Value |
| --- | --- |
| `mode` | `CONNECTION_BOUND` |
| `provider` | `INSTAGRAM` |
| `authFamily` | `INSTAGRAM_BUSINESS_LOGIN` |
| `deliveryPath` | `DATABASE_ONLY` |
| `channelConnectionId` | UUID (exact connection) |
| `messageKind` | `TEXT` \| `IMAGE` |

Prohibited on queue payload: tokens, ciphertext, usernames, Page IDs, raw provider payloads.

Parser: `src/lib/instagramOAuthOutboundQueueContract.ts` (strict zod).

---

## Enqueue-time source of truth

`resolveInstagramOutboundEnqueueBinding` (`src/application/instagramOAuth/resolveInstagramOutboundEnqueueBinding.ts`):

- Derives from `conversation.channel_connection_id` + DB OAuth credential state
- Never trusts client-provided binding
- Skips binding for `INSTAGRAM_COMMENT` (private reply stays legacy)
- OAuth-managed + missing `channel_connection_id` → fail closed when legacy Page token unavailable
- OAuth + legacy Page token both configured → ambiguous, fail closed
- Non-OAuth connections → no binding (legacy job)

---

## Legacy compatibility

| Job class | Binding | Worker path |
| --- | --- | --- |
| `LEGACY_INSTAGRAM_JOB` | absent or `{ mode: LEGACY }` | Existing `InstagramAdapter` |
| `OAUTH_INSTAGRAM_JOB` | `CONNECTION_BOUND` complete | OAuth text/image services |
| `INVALID_OR_AMBIGUOUS_JOB` | parse/validation failure | Terminal configuration error |
| `NON_INSTAGRAM_JOB` | n/a | Unchanged channel routing |

No OAuth→legacy or legacy→OAuth fallback.

---

## OAuth routing decision matrix

| Condition | Result |
| --- | --- |
| Non-Instagram channel | Existing routing |
| OAuth binding + all flags ON + kind match | OAuth text or image service |
| OAuth binding + worker-routing OFF | Terminal config (no provider call) |
| OAuth binding + text/image flag OFF | Terminal config (no provider call) |
| Legacy job (no binding) | Legacy adapter |
| Invalid/ambiguous binding | Terminal config (neither path) |

---

## Feature flags

| Flag | Default | Gate |
| --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | OFF | OAuth foundation |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | OFF | OAuth runtime |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | OFF | Worker OAuth routing (new) |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | OFF | OAuth text send |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | OFF | OAuth image send |

OAuth text requires: FOUNDATION + RUNTIME + WORKER_ROUTING + OUTBOUND_TEXT.  
OAuth image requires: FOUNDATION + RUNTIME + WORKER_ROUTING + OUTBOUND_IMAGE.

---

## Text/image routing

- **Text:** `messageKind: TEXT` → `instagramOAuthTextDelivery.sendText`
- **Image:** `messageKind: IMAGE` → `instagramOAuthImageDelivery.sendImage`
- Recipient: IGSID from `ig:user:{IGSID}` via `extractInstagramRecipientIgsidFromThreadId`
- Private reply, unsupported media kinds: not routed on OAuth path

---

## Idempotency and retry preservation

- Existing idempotency scope/key unchanged
- OAuth path uses same `markSent` / `markFailed` / queue retry classification
- Binding immutable after enqueue; retries reuse same snapshot
- Terminal OAuth failures mark idempotency processed (no endless retry)
- Retryable OAuth failures release idempotency for queue backoff

---

## Error taxonomy

OAuth service errors map to existing worker policy via `mapInstagramOAuthWorkerDeliveryFailure`:

- Flag OFF → configuration-disabled, non-retry
- Invalid binding → terminal configuration
- REAUTH / revoked / expired → terminal until reauth
- Rate limit / provider 5xx → retryable
- Invalid recipient / media → terminal delivery

`last_error_preview` uses sanitized operator messages only.

---

## DB/RPC changes

Additive migration `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql`:

- New RPC param `p_instagram_credential_binding jsonb default null`
- Merged into outbox payload when non-null
- `supabase/schema.sql` updated for parity
- Legacy callers omit param → unchanged behavior

---

## Test evidence

| Area | File |
| --- | --- |
| Enqueue binding | `resolveInstagramOutboundEnqueueBinding.test.ts` |
| Queue contract | `instagramOAuthOutboundQueueContract.test.ts` |
| Worker routing flags | `instagramOAuthWorkerRoutingFlags.test.ts`, `instagramOAuthOutboundWorkerRouting.test.ts` |
| Worker use case | `sendOutboundMessage.instagramOAuthWorkerRouting.test.ts` |
| RPC forwarding | `supabaseOutboundCommandRepository.test.ts` |
| API regression | `messagesSend.route.test.ts` (enqueue deps mocked) |

Full suite: **2255 pass**.

---

## Production boundary

- No production flag enablement
- No production migration execution
- No deployment or live Meta calls
- No merge performed in this phase

---

## Deferred work

- Historical `channel_connection_id` backfill for OAuth-only tenants
- OAuth private reply routing (IG-AUTH-2F)
- Production canary / flag enablement
- Legacy Instagram retirement

---

## Scope confirmation

IG-AUTH-2E.3 worker/queue exact connection binding and controlled routing only. No production feature-flag or environment changes. No production migration execution. No deployment. No live Meta calls or real outbound messages. No private reply, webhook, profile enrichment, OAuth UI, refresh scheduler, or legacy retirement. No production canary. No merge performed.
