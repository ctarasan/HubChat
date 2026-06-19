# Agent A — Latest Report

**IG-AUTH-2E.1 — OAuth DM Text Adapter Foundation (2026-06-19)**

Evidence: [`2026-06-19-ig-auth-2e-1-oauth-dm-text-adapter.md`](./2026-06-19-ig-auth-2e-1-oauth-dm-text-adapter.md)

OAuth Instagram DM text provider client + application service on master `d4865e4`. Uses `graph.instagram.com/{IG_ID}/messages` with Bearer auth, `resolveForDelivery`, and new `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` flag (default OFF). **No worker/queue cutover.**

Prior: IG-AUTH-2E.0 outbound contract audit ([#248](https://github.com/ctarasan/HubChat/pull/248)); 2D identity + OAuth Test Connection ([#247](https://github.com/ctarasan/HubChat/pull/247)).
