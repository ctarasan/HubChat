# Agent Report — FPC-2E Source Post Metadata API Bridge

## Problem

PR #209 persisted safe `source_post_snippet` into `messages.metadata_json`, but Dashboard Source Post Context panel still showed fallback because `GET /api/conversations` did not bridge persisted metadata into `source_post_context.post_snippet`.

## Fix

After paginated conversation list fetch, run one bounded secondary query for eligible Facebook/Instagram comment/private-reply conversation IDs only. Attach allowlisted metadata to list rows as `source_post_message_metadata` before `toConversationListItemDto` / `buildSourcePostContext`.

No Graph/provider fetch. Fail-open on metadata lookup errors.

## Out of scope

- Webhook/worker ingest enrichment (PR #209)
- LINE-EVT-1 event-only filter
- Dashboard UI changes
