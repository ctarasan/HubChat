# Agent Report — FPC-2F Source Post Thumbnail Capture

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-12 |
| Phase | FPC-2F — Source post thumbnail/preview metadata for comment-origin conversations |
| Branch | `feature/fpc-2f-source-post-thumbnail-capture` |

## Goal

Extend persisted and list API `source_post_context` with a safe parent-post thumbnail URL for Facebook/Instagram comment leads, using existing webhook payload and ingest-time Graph metadata only.

## API contract

`source_post_context.post_thumbnail_url: string | null` on `GET /api/conversations` list items (existing DTO field; populated when safe thumbnail metadata is available).

## What changed

- `src/lib/sourcePostThumbnailSanitize.ts` — HTTPS allowlist sanitizer; blocks profile/avatar URLs
- `src/lib/sourcePostContextMetadata.ts` — persist `source_post_thumbnail_url`; thumbnail-only metadata allowed
- `src/lib/facebookGraphPostMessage.ts` — Graph fetch adds `full_picture` → `thumbnailUrl`
- `src/lib/sourcePostIngestEnrichment.ts` — passes thumbnail from Graph; accepts webhook thumbnail without snippet
- `src/infrastructure/adapters/channels/facebookAdapter.ts` — webhook `value.photo` → safe metadata before enrichment
- `src/infrastructure/adapters/channels/instagramAdapter.ts` — Graph `media_url` / `thumbnail_url` on existing media fetch
- `src/domain/sourcePostContext.ts` — reads `source_post_thumbnail_url` from message metadata
- `src/application/sourcePost/bridgeConversationListSourcePostMetadata.ts` — bridges rows with snippet **or** thumbnail
- `src/infrastructure/adapters/repositories/supabaseMessageRepository.ts` — lookup OR filter for snippet/thumbnail keys

## Persisted metadata keys

`source_post_snippet`, `source_post_thumbnail_url`, `source_post_captured_at`, `source_post_source`

## Safety / constraints

- No DB migrations
- No new Graph calls beyond extending existing Facebook post / Instagram media ingest fetches
- Comment attachment images (`mediaUrl` / `previewUrl`) are **not** used as parent post thumbnails
- Facebook webhook `value.photo` is **not** used as `source_post_thumbnail_url` (may be comment attachment); parent thumbnail comes only from Graph `full_picture`
- Facebook comment IMAGE ingest still enriches parent post snippet/thumbnail via Graph
- No reaction-only filtering changes (FPC-2H.x preserved)
- Fail-open on Graph / lookup errors

## Known limitations

- Historical comments lack thumbnail until new inbound events or backfill
- Facebook webhook `photo` availability varies by subscription fields
- Instagram video posts may only expose `thumbnail_url` (not full `media_url`)

## Verification

- `npx tsc --noEmit` — pass
- FPC-2F unit tests (sanitizer, metadata, ingest enrichment, domain DTO, list bridge, message repo) — pass
- Full suite — 1861 tests pass after mock/query assertion fixes
