# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-17 (Agent A — IG-AUTH-0 Instagram token audit)

## Current master

- Master HEAD: `c506c168` (PR **#237** encryption-key wiring merged)
- IG-AUTH-0: **IN REVIEW** — docs-only audit; Agent B **PASS WITH NOTES** on `0a3cc19`; severity P0 **0** / P1 **8** / P2 **4**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE / Facebook / Instagram runtime modes | **`DB_WITH_ENV_FALLBACK`** (per prior rollout reports) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **Confirm in prod** — historically off/absent in reports |
| Instagram OAuth | **Not implemented** — manual Channel Settings + env tokens |
| Instagram profile avatar cache | **Parked** — `HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED` default off |

## IG-AUTH-0 focus

- Instagram auth families, credential inventory, 8-path traces — see `docs/agent-reports/agent-a/2026-06-17-ig-auth-0-current-state-audit.md`
- Token consumer matrix: `docs/instagram/ig-auth-token-consumer-matrix.md`
- OAuth migration inputs: `docs/instagram/ig-oauth-migration-inputs.md`
- See `docs/agent-reports/agent-a/latest.md`

## Guardrails

- IG OAuth design **not started** — audit inputs only
- **`--execute`:** prohibited
- Marketplace / CDP bridge: **out of scope**

## Agent A

See `docs/agent-reports/agent-a/latest.md` — IG-AUTH-0 Instagram token audit.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
