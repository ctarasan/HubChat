# Agent A — Latest Report

**FPC-2C.1 — Worker ingest source post hotfix (2026-06-10)**

Evidence: [`2026-06-10-fpc-2c-1-source-post-worker-ingest-hotfix.md`](./2026-06-10-fpc-2c-1-source-post-worker-ingest-hotfix.md)

Production FB comment had `{}` metadata because webhook-time Graph enrichment did not reach persistence. Hotfix adds fail-open worker-side `post.message` fetch via `facebookPostId` on queue payload + safe ingest diagnostics logging.

Prior: FPC-2C (#208) ingest persistence merged; inbox healthy after #206 revert.
