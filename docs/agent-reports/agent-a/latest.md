# Agent A — Latest Report

**FPC-2B — Source Post Parent Context Discovery (2026-06-10)**

Evidence: [`../../fpc-2b-source-post-parent-context-discovery.md`](../../fpc-2b-source-post-parent-context-discovery.md)

**Finding:** Parent post text is **not** in persisted message metadata today. Webhooks carry comment text + IDs only; `processInboundMessage` stores `{}` for TEXT comments; Facebook webhook drops adapter `metadataJson` before outbox.

**Recommended next:** **FPC-2C** — webhook-time safe `source_post_snippet` capture (optional Graph post/caption fetch at ingest, fail-open). Reland FPC-2A list read only after DB has safe keys, with acyclic imports + fail-open enricher.

Prior: PR #206 reverted FPC-2A (#205) production 500; inbox restored. FPC-1A/1B (`source_post_context` DTO + UI card) remain merged.
