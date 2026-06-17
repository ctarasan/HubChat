# Agent A — Latest Report

**IG-AUTH-0 — Instagram Authentication & Token Current-State Audit (2026-06-17)**

Evidence: [`2026-06-17-ig-auth-0-current-state-audit.md`](./2026-06-17-ig-auth-0-current-state-audit.md)

Docs-only audit on master `c506c168`. Five runtime auth families identified (Page access token, verify token, app secret, encryption key, rejected IGA). **Findings (post Agent B review):** P0 **0**, P1 **8**, P2 **4**. Key blockers: no Instagram OAuth, intra-tenant connection-binding gap (no `channelConnectionId` on IG outbound), test-connection vs worker credential split, webhook secret-source alignment. Deliverables: token consumer matrix + OAuth migration inputs under `docs/instagram/`. Agent B: **PASS WITH NOTES** on `0a3cc19`. **No runtime/schema/env changes.**

Prior: FB-OAUTH encryption-key wiring ([#237](https://github.com/ctarasan/HubChat/pull/237)); worker outbound diagnostics ([#236](https://github.com/ctarasan/HubChat/pull/236)).
