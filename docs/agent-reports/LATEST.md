# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first for continuity. Do not rely on chat history alone.  
> Last updated: 2026-05-22 (Agent A — docs handoff protocol)

## Current Master
- Commit: `25eefc4` — feat: add Instagram outbound runtime config fallback (#62)
- Last merged PR: **#62** (Phase II-G2-C3 Instagram outbound runtime foundation)
- Working tree expectation: clean tracked tree on `master`; agent reports live under `docs/agent-reports/`

## Current Runtime Status
- **LINE outbound:** Working; runtime cutover foundation merged; **DB_WITH_ENV_FALLBACK rollout PASS** (worker)
- **Facebook outbound:** Working; runtime cutover foundation merged (#61); **DB_WITH_ENV_FALLBACK rollout PASS** (worker)
- **Instagram outbound:** Working in default **ENV_ONLY** mode; foundation merged (#62); foundation smoke **PASS**
- **Instagram DB rollout:** **Not started / not confirmed** — do not assume `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` on Railway until ops rollout is explicitly completed and reported
- **Inbound webhooks:** Working; still use existing env-based verification (unchanged by outbound runtime phases)
- **Channel Settings / Test connection:** Working
- **Worker logs:** Clean; no known secret leaks in logs
- **Secret leak status:** No known leaks; continue present/missing-only reporting for env snapshots

## Agent A Latest
- Branch: `docs/agent-report-handoff-protocol` (in progress) → merge to `master` after PR
- PR: TBD — docs: add agent report handoff protocol
- Status: **In progress** — documentation/process only
- Summary: Adding `docs/agent-reports/` handoff protocol, template, `LATEST.md`, `PROJECT_STATE.md`, and agent latest stubs so ChatGPT can read repo state without manual paste.
- Next action: Merge docs PR; then proceed with **Instagram DB_WITH_ENV_FALLBACK controlled rollout** (ops-only) after safe Railway snapshot and Channel Settings INSTAGRAM row + Test connection READY

## Agent B Latest
- Branch: *(none)*
- PR: *(none)*
- Status: **Inactive** — do not start Agent B work unless explicitly requested
- Summary: Placeholder only.
- Next action: None

## Open Risks
- Instagram **DB** path requires `channel_settings` row for INSTAGRAM with configured secrets; DB rollout should not be assumed complete until ops report confirms Railway mode + smoke + `runtimeSource: db` (if applicable)
- Avoid further token/env changes until a safe runtime/config snapshot (present/missing only) is captured before Instagram ops rollout
- Facebook `channel_settings` DB token fingerprint may be empty while outbound still works via env fallback—expected under DB_WITH_ENV_FALLBACK

## Recommended Next Step
1. Merge agent report handoff protocol PR (docs-only).
2. **Ops-only:** Phase II-G2-C3-R — Instagram `DB_WITH_ENV_FALLBACK` controlled rollout on Railway worker only (no code unless bug found).
3. Prerequisites: Instagram Channel Settings saved + Test connection **READY**; capture Railway env snapshot (no secret values in reports).
