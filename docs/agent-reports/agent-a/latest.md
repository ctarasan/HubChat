# Agent A — Latest Report

**FB-OAUTH-1C — Facebook OAuth runtime health and reconnect (2026-06-15)**

Evidence: [`2026-06-15-fb-oauth-1c-runtime-health-reconnect.md`](./2026-06-15-fb-oauth-1c-runtime-health-reconnect.md)

Activates `POST /health` and `POST /reconnect`; OAuth credential from `channel_credentials`; five readiness-blocking checks before first `READY`/`CONNECTED`; Test Connection alignment; reconnect with fresh OAuth transaction. Production rollout **not** complete.

Prior: FB-OAUTH-1B ([#225](https://github.com/ctarasan/HubChat/pull/225)); FB-OAUTH-1A contract ([#222](https://github.com/ctarasan/HubChat/pull/222)); FB-OAUTH-1D UI ([#224](https://github.com/ctarasan/HubChat/pull/224), spec [#223](https://github.com/ctarasan/HubChat/pull/223)); FPC-CLEANUP-1 ([#221](https://github.com/ctarasan/HubChat/pull/221)).
