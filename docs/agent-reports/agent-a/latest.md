# Agent A — Latest Report

**IG-AUTH-0 — Instagram Authentication & Token Current-State Audit (2026-06-17)**

Evidence: [`2026-06-17-ig-auth-0-current-state-audit.md`](./2026-06-17-ig-auth-0-current-state-audit.md)

Docs-only audit on master `c506c168`. Five runtime auth families identified (Page access token, verify token, app secret, encryption key, rejected IGA). Key blockers: no Instagram OAuth, tenant-global outbound resolver (no `channelConnectionId`), test-connection vs worker credential split, ENV webhook auth vs per-tenant DB UI. Deliverables: token consumer matrix + OAuth migration inputs under `docs/instagram/`. **No runtime/schema/env changes.**

Prior: FB-OAUTH encryption-key wiring ([#237](https://github.com/ctarasan/HubChat/pull/237)); worker outbound diagnostics ([#236](https://github.com/ctarasan/HubChat/pull/236)).
