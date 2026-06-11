# Agent Report — LINE-EVT-1 Event-Only Inbox Pollution Hotfix

## Production symptom

Inbox polluted by LINE rows with `content_preview = [event]`, `provider_thread_type = null`, `real_messages = 0`. These users do not appear as real chats in SmartKorp LINE OA.

## Root cause

`LineAdapter.receiveMessage` synthesized inbound TEXT `[event]` (or `[type]`) for LINE webhook events without a real customer `message` payload (follow, unfollow, postback, etc.). The webhook handler enqueued these into `message.inbound.normalized`, creating/bumping OPEN conversations.

## Fix

1. **Ingest gate** (`lineInboundWebhookGate` + `line.ts`): ignore non-message LINE webhook events before adapter normalization/outbox enqueue. Allowed customer payloads: `message` events with type text/image/sticker/file/audio/video/location.
2. **Adapter safety** (`lineAdapter.ts`): throw `LINE_NON_MESSAGE_WEBHOOK_EVENT` instead of synthesizing `[event]` text.
3. **Read-side guard** (`lineEventOnlyInboxFilter` + `supabaseConversationRepository.list`): exclude existing LINE conversations whose `last_message_preview` is `[event]`, `[Empty]`, or null from inbox list queries (no DB mutation).

## Out of scope

- FPC source post context / PR #209 worker fallback
- Facebook/Instagram ingest
- Migrations / Dashboard UI

## Production smoke (post-merge)

1. Trigger LINE follow/event-only webhook → no new `[event]` row in Inbox
2. Send real LINE text → appears in Inbox normally
3. `GET /api/conversations?limit=25&scope=all` → 200
4. Existing event-only LINE conversations hidden from Inbox
5. Facebook comment source post metadata unaffected
