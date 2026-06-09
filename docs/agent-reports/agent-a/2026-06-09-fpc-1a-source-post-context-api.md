# Agent Report — FPC-1A Source Post Context API Foundation

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-09 |
| Phase | FPC-1A — Source post context for comment/private-reply Details panel |
| Branch | `feature/fpc-1a-source-post-context-api` |

## Goal

Expose safe `source_post_context` on conversation list DTOs for Facebook/Instagram comment and private-reply leads without Graph API calls, migrations, or secret/provider ID leakage.

## API contract

**Field:** `source_post_context` on `ConversationListItemDto` (`GET /api/conversations` items)

`null` for LINE and normal DM. Populated for Facebook/Instagram `COMMENT` and `PRIVATE_REPLY` sources.

See `SourcePostContextDto` in `src/domain/sourcePostContext.ts`.

## Data sources

- `conversations`: `channel_type`, `provider_thread_type`, `private_reply_sent_at`, `last_message_preview`, `last_customer_message_at`, `last_message_at`
- Internal only (not in DTO): `provider_comment_id` from row when present
- Optional enrichment keys on row (future/detail): `source_post_snippet`, `source_post_message_metadata`, etc.
- Inbound message metadata (`thumbnailUrl`, `fullImageUrl`) when passed into builder

## Known gaps

- List API does not join first inbound message — post caption/thumbnail usually null; `fallback_message` shown
- `open_post_available` / `open_post_href` deferred (no redirect route in FPC-1A)
- Private-reply threads may show latest preview (agent reply) instead of original comment without message join
- No Meta Graph API — post details not fetched live

## Out of scope

- UI, migrations, worker, webhooks, outbound, DB_ONLY, resolver flag, profile enrichment

## Tests

- `src/domain/sourcePostContext.test.ts`
- `src/interfaces/api/inboxDtos.test.ts`
