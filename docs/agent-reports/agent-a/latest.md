# Agent A — Latest Report

**FPC-2C — Source Post Safe Capture at Ingest (2026-06-10)**

Evidence: [`2026-06-10-fpc-2c-source-post-safe-capture.md`](./2026-06-10-fpc-2c-source-post-safe-capture.md)

Ingest-time persistence of `source_post_snippet` / `source_post_captured_at` / `source_post_source` on inbound messages. Acyclic sanitizer libs; Facebook webhook metadata plumbing; fail-open Graph post/caption fetch at adapter only. **No** list-time enrichment on `GET /api/conversations`.

Prior: FPC-2B discovery merged (#207); FPC-2A reverted (#206); FPC-1A/1B DTO + UI card remain.
