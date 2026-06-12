# Agent Report — FB-ECHO-1 Facebook Native Messenger Outbound Echo Sync

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-12 |
| Phase | FB-ECHO-1 — Ingest Meta `message_echoes` as HubChat OUTBOUND |
| Branch | `feature/fb-echo-1-facebook-messenger-echo-sync` |

## Root cause

Operators replying from Facebook Messenger or Meta Business Suite send messages as the Facebook Page. Meta delivers these on the Page webhook as **`messaging` events with `message.is_echo: true`** (requires the **`message_echoes`** subscription field).

HubChat previously skipped every echo in `facebookAdapter.receiveMessage`:

```typescript
if (msg.message.is_echo) continue;
```

Echoes were therefore **delivered by Meta (when subscribed) but ignored** — not parsed, not enqueued, not persisted. FPC-2G feed self-comment suppression does **not** apply to Messenger `messaging` events.

## Meta configuration (required)

| Setting | Required value |
|---|---|
| Page webhook subscribed fields | `messages` **and** `message_echoes` |
| Object | `page` |

**This feature is not production-ready until:**

1. `message_echoes` is confirmed on the Page subscription (Meta App Dashboard → Webhooks → Page → Edit subscription).
2. A live webhook delivery with `is_echo: true` is observed in logs (`event_type: facebook_message_echo`).
3. Native Messenger smoke test succeeds (see checklist below).

## Fix summary

| Layer | Change |
|---|---|
| `facebookMessengerWebhookEvents.ts` | Parse `messaging` into `inbound_messenger` / `message_echo`; skip delivery/read/reaction; FPC-2G guard on inbound only |
| `webhook/facebook.ts` | Enqueue echoes on `message.inbound.normalized` with `webhookIngestKind: facebook_messenger_echo`; process mixed inbound+echo in one POST |
| `processFacebookMessengerEcho.ts` | Insert OUTBOUND by `mid`; resolve conversation by customer PSID; dedupe HubChat sends |
| `inboundWorker.ts` / `main.ts` | Route echo payloads to echo use case |
| `supabaseMessageRepository.ts` | `findByTenantChannelExternalMessageId` for mid dedupe |

`facebookAdapter.receiveMessage` still skips echoes (inbound path unchanged); echoes are ingested via the dedicated parser in the webhook handler.

## Message / deduplication contract

| Field | Echo behavior |
|---|---|
| `direction` | `OUTBOUND` |
| `channel_type` | `FACEBOOK` |
| `external_message_id` | Meta `mid` |
| `sender_type` | `SYSTEM` (no invented HubChat sales agent) |
| `metadata_json.outbound_origin` | `facebook_native_echo` |
| `metadata_json.delivery_status` | `SENT` on native insert |
| Conversation lookup | `findFacebookMessengerDmByParticipant(pageId, customerPsid)` then `findByThread` fallbacks |
| Lead creation | **Never** for echo ingest |
| Idempotency (webhook) | `facebook:echo:{mid}` |
| Idempotency (DB) | Existing row `(tenant_id, channel_type, external_message_id)` |
| HubChat send + later echo | One timeline row; `PENDING` may be strengthened to `SENT`, never downgraded |
| Unsupported | Delivery, read, reaction, comment feed events do not create messages |

## Observability (safe logs only)

```json
{
  "provider": "FACEBOOK",
  "event_type": "facebook_message_echo",
  "result": "inserted | deduplicated | conversation_not_found | unsupported_attachment | accepted",
  "has_mid": true
}
```

No message text, PSID, Page ID, tokens, attachment URLs, or raw payloads in logs.

## Production smoke checklist

- [ ] Confirm Page webhook subscription includes `message_echoes`
- [ ] Send a test reply from Meta Business Suite (not HubChat) to an existing Messenger thread
- [ ] Verify webhook log: `event_type: facebook_message_echo`, `result: accepted`
- [ ] Verify worker log: `result: inserted` (or `deduplicated` if retried)
- [ ] Verify HubChat timeline shows one OUTBOUND row with Meta `mid`
- [ ] Send the same reply path twice / replay webhook → still one row (`deduplicated`)
- [ ] Send from HubChat → echo arrives → still one row, delivery status not weakened

## FPC-2G interaction

Feed comment self-suppression (`value.from.id === entry.id`) applies only to `changes` feed/comment events. Messenger `message_echo` parsing runs in a separate branch and is never suppressed by FPC-2G.
