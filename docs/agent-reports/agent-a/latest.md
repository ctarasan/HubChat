# Agent A — Latest Report

**IG-AUTH-2E.0 — Outbound Messaging Contract Audit (2026-06-19)**

Evidence: [`2026-06-19-ig-auth-2e-0-outbound-contract-audit.md`](./2026-06-19-ig-auth-2e-0-outbound-contract-audit.md)

Docs-only design gate on master `38b35a8`. Maps legacy Instagram outbound (Facebook Page token + `graph.facebook.com`) vs OAuth cutover requirements. OAuth resolver and queue binding types exist (IG-AUTH-2B/2D) but are **not wired** to outbox/worker. Recommends 2E.1 text adapter → 2E.2 image → 2E.3 queue/worker binding. Provider contract: [`docs/instagram/ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md). **No runtime/schema/env changes.**

Prior: IG-AUTH-2D identity + OAuth Test Connection ([#247](https://github.com/ctarasan/HubChat/pull/247)); 2D review prep ([#246](https://github.com/ctarasan/HubChat/pull/246)).
