# Agent Report — FPC-2A Source Post Text Enrichment

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-09 |
| Phase | FPC-2A — Text-first source post snippet enrichment |
| Branch | `feature/fpc-2a-source-post-text-enrichment` |

## Goal

Populate `source_post_context.post_snippet` from **already-stored** inbound message metadata on `GET /api/conversations` without live Graph API calls, migrations, or UI changes.

## Text-first / cost guardrails

- One batched read of earliest inbound customer `metadata_json` per comment/private-reply conversation on the current list page only
- Select columns: `conversation_id, metadata_json, created_at` (no `raw_payload`, no message bodies)
- Hard row cap: `min(conversationCount * 20, 500)`
- Allowlisted text keys only; never pass through whole metadata blobs to the API DTO
- `open_post_available=false`, `open_post_href=null` unchanged
- Thumbnail remains optional/deferred (only safe HTTPS keys forwarded when already present)

## Allowlisted metadata keys

`source_post_snippet`, `source_post_message`, `source_post_text`, `post_message`, `post_caption`, `post_snippet`, `post_text`, `parent_post_message`, `parent_post_caption` (+ camelCase variants)

Blocked: `rawPayload`, `graphCommentDetail`, `permalinkUrl`, tokens, provider IDs, URL-only values, JSON blobs.

## Known limitations

- Inbound pipeline today often persists `{}` metadata for TEXT comments — enrichment activates when allowlisted keys exist (manual backfill or future webhook storage)
- Parent post caption is **not** stored separately from lead comment text in current webhook persistence
- Open post + live Graph fetch remain out of scope (FPC-2B+)
- Earliest-message batch query may read up to 20 inbound rows per enriched conversation (bounded)

## Out of scope

UI, migrations, worker, webhooks, outbound, Graph API client, profile enrichment, package deps
