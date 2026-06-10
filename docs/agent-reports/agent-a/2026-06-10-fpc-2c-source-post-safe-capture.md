# Agent Report — FPC-2C Source Post Safe Capture (Ingest)

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-10 |
| Phase | FPC-2C — Webhook-time safe source post snippet persistence |
| Branch | `feature/fpc-2c-source-post-safe-capture` |

## What changed

- Acyclic sanitizer: `src/lib/sourcePostSnippetSanitize.ts`
- Safe metadata builder: `src/lib/sourcePostContextMetadata.ts`, `src/lib/sourcePostInboundMetadata.ts`
- `sourcePostContext.ts` imports sanitizer one-way; reads `source_post_snippet` from `messageMetadata`
- Facebook webhook forwards `metadataJson` to outbox
- Facebook adapter: ingest-time Graph `post.message` fetch (fail-open) → safe metadata only
- Instagram adapter: ingest-time Graph `media.caption` fetch (fail-open) → safe metadata only
- `processInboundMessage` persists allowlisted source post keys on TEXT inbound messages

## Persisted metadata keys

`source_post_snippet`, `source_post_captured_at`, `source_post_source` (`webhook_payload` | `ingest_graph`)

## Graph enrichment

**Included** at webhook/adapter ingest only (fail-open):

- Facebook: `GET /{post-id}?fields=message`
- Instagram: `GET /{media-id}?fields=caption`

**Not** called from `GET /api/conversations` or list DTO mapping.

## Safety / cost

- No list-time batch enrichment (PR #205 path not reintroduced)
- No dashboard-time provider fetch
- No image proxy, storage buckets, or base64
- No raw webhook payload / provider IDs / tokens in message metadata or `source_post_context` DTO
- Circular imports prevented: lib → domain one-way only

## Known limitations

- List API still reads conversation rows only; `post_snippet` on Details card requires `source_post_message_metadata` on list row (FPC-2E read/denormalize) or message API join — **new comments persist snippet on `messages.metadata_json`**
- Graph fetch requires page token; failures leave `{}` metadata (fail-open)
- Historical comments need backfill or new inbound events

## Production smoke checklist

1. Deploy branch; confirm `GET /api/conversations?limit=25&scope=all` returns **200**
2. Trigger new Facebook comment webhook; verify `messages.metadata_json` contains `source_post_snippet` (DB)
3. Confirm no 500 on dashboard load
4. Details card may still show fallback until FPC-2E exposes persisted snippet on list DTO
