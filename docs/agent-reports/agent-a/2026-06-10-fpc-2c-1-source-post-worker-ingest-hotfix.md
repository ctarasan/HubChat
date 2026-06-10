# Agent Report — FPC-2C.1 Worker Ingest Source Post Hotfix

## Production symptom

Fresh Facebook comment persisted with `messages.metadata_json = {}` after PR #208 deploy (worker only confirmed).

## Root cause

FPC-2C Graph enrichment ran **only on the Vercel webhook** (`FacebookAdapter.receiveMessage`). The Railway worker persisted `metadataJson` from the outbox payload as-is. When webhook-time Graph failed or returned empty (missing/wrong `FACEBOOK_PAGE_ACCESS_TOKEN` on Vercel, permissions, or Vercel not redeployed), outbox carried `{}` and the worker had **no fallback** even though `facebookPostId` was present on the queue payload.

## Fix

- Shared `resolveSourcePostMetadataForInbound` used by webhook adapter **and** `processInboundMessage` worker path.
- Worker fail-open Graph `post.message` fetch when payload metadata lacks `source_post_snippet` but `facebookPostId` exists.
- Safe diagnostics logging (no tokens/IDs/raw payloads):
  - `source_post_enrichment_attempted`
  - `source_post_enrichment_source`
  - `source_post_snippet_present`
  - `source_post_enrichment_failed_reason` (enum)

## Deploy note

Deploy **both** Vercel (webhook) and Railway (worker). Worker-only deploy is now mitigated but Vercel should still be on #208+ for first-pass enrichment.

## Out of scope

- `GET /api/conversations` / list-time enrichment unchanged
- Dashboard UI unchanged
