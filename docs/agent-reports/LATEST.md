# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first for continuity. Do not rely on chat history alone.  
> Last updated: 2026-05-22 (Agent A — Phase II-G2-C3-R Instagram rollout attempt)

## Current Master
- Commit: `7ce50d2` — docs: add agent report handoff protocol (#63)
- Last merged PR: **#63** (agent reports); **#62** Instagram outbound runtime foundation
- Working tree expectation: clean tracked tree on `master`

## Current Runtime Status
- **LINE outbound:** Working; **DB_WITH_ENV_FALLBACK rollout PASS** (per project context; re-verify Railway snapshot after `railway login`)
- **Facebook outbound:** Working; **DB_WITH_ENV_FALLBACK rollout PASS** (per project context)
- **Instagram outbound:** Working in **ENV_ONLY** (default); foundation #62 merged; recent DB sends **DONE/SENT**
- **Instagram DB rollout (`DB_WITH_ENV_FALLBACK`):** **NOT COMPLETE** — agent blocked on Railway CLI auth; operator must apply env + redeploy
- **Inbound webhooks:** Working (unchanged)
- **Channel Settings / Test connection:** Working in general; **INSTAGRAM row missing in `channel_settings` DB** — configure before expecting `runtimeSource: db`
- **Worker logs:** Not re-checked this session (Railway CLI blocked)
- **Secret leak status:** No secrets in agent reports; continue present/missing-only for env snapshots

## Agent A Latest
- Branch: `docs/phase-ii-g2-c3-r-instagram-rollout-report` (docs report for blocked rollout)
- PR: TBD — `docs: record Instagram runtime rollout result`
- Status: **BLOCKED (incomplete)** — Railway `railway login` required
- Summary: Documented pre-rollout DB baseline and rollout checklist; could not set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` or run Dashboard/worker smoke from agent environment.
- Next action: Operator completes Steps 2–7; update report to PASS/FAIL

## Agent B Latest
- Branch: *(none)*
- PR: *(none)*
- Status: **Inactive**
- Summary: Placeholder only.
- Next action: None

## Open Risks
- Railway OAuth expired in agent shell — ops must use interactive `railway login`
- Instagram `channel_settings` absent → DB path falls back to env until Channel Settings saved + Test connection READY
- Do not assume Instagram production mode is `DB_WITH_ENV_FALLBACK` until operator confirms post-redeploy logs

## Recommended Next Step
1. `railway login` → snapshot worker env (present/missing only).
2. Pre-smoke all channels (Dashboard).
3. Instagram Channel Settings → save + Test connection **READY**.
4. Set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` on worker → redeploy.
5. Post-smoke + DB sanity → update [`agent-a/2026-05-22-phase-ii-g2-c3-r-instagram-db-fallback-rollout.md`](./agent-a/2026-05-22-phase-ii-g2-c3-r-instagram-db-fallback-rollout.md) to PASS/FAIL.
