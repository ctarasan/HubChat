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

`FACEBOOK_PAGE_ACCESS_TOKEN` must be configured on the Railway worker for worker-side fallback enrichment, and on Vercel for webhook-time enrichment. Missing tokens must fail open and only log a safe `missing_access_token` reason.

## FPC-2C.1 patch (IG passthrough)

`resolveSourcePostMetadataForInbound` now preserves safe `source_post_snippet` from payload metadata for Instagram comment leads before Facebook-only Graph fallback runs.

## Out of scope

- `GET /api/conversations` / list-time enrichment unchanged
- Dashboard UI unchanged
