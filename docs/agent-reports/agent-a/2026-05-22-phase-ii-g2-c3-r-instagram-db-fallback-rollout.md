# Agent Report

## Metadata
- Agent: A
- Date: 2026-05-22
- Phase / Task: Phase II-G2-C3-R — Instagram `DB_WITH_ENV_FALLBACK` controlled rollout (ops)
- Branch: `docs/phase-ii-g2-c3-r-instagram-rollout-report`
- Base commit: `7ce50d2`
- Head commit: *(see PR merge commit)*
- PR: TBD
- Status: **BLOCKED (incomplete)** — Railway CLI unauthorized; rollout env change not applied by agent

## Goal
Roll out Instagram outbound runtime config from `ENV_ONLY` to `DB_WITH_ENV_FALLBACK` on Railway worker only, with pre/post smoke and DB sanity checks. No application code changes unless a bug is found.

## Scope
- Ops: Railway worker `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` only
- No `DB_ONLY`, no LINE/Facebook mode changes, no inbound webhook/Vercel/schema/package/UI changes
- Agent report updates per handoff protocol

## Repo sync (Step 1)
| Check | Result |
|-------|--------|
| `master` @ `7ce50d2` | PASS — includes PR **#63** (agent reports) and **#62** (Instagram runtime foundation) |
| `git status` (tracked) | Clean on `master` |

## Pre-rollout snapshot (Step 2) — no secrets

### Railway worker — **not captured (CLI blocked)**
`railway whoami` / `railway variable list` failed: OAuth token refresh invalid (`invalid_grant`). Operator must run `railway login` and re-run snapshot.

| Variable | Expected pre-rollout | Agent-reported status |
|----------|----------------------|------------------------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` | **Unknown** (CLI blocked) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` | **Unknown** (CLI blocked) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | unset → `ENV_ONLY` | **Unknown** (CLI blocked) |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | present | **Unknown** |
| `INSTAGRAM_ACCESS_TOKEN` | present or missing | **Unknown** |
| `INSTAGRAM_ACCOUNT_ID` | present or missing | **Unknown** |
| `META_GRAPH_VERSION` | present | **Unknown** |
| `SUPABASE_URL` | present | **Unknown** on Railway |
| `SUPABASE_SERVICE_ROLE_KEY` | present | **Unknown** on Railway |

### Supabase `channel_settings` (safe fields)
| Channel | Status | `accessToken` configured | `providerPageId` |
|---------|--------|--------------------------|------------------|
| LINE | READY | yes | present |
| FACEBOOK | NOT_CONFIGURED | no | present |
| INSTAGRAM | **no row** | — | — |

**Note:** Facebook outbound can still work via env fallback under `DB_WITH_ENV_FALLBACK` (matches prior LINE/Facebook rollout pattern). Instagram `DB_WITH_ENV_FALLBACK` will **fall back to env** until an INSTAGRAM `channel_settings` row exists with configured secrets.

### Latest Instagram outbound (pre-rollout baseline, DB)
| Field | Latest job (`7783aba4-…`) |
|-------|---------------------------|
| Queue status | DONE |
| `retry_count` | 0 |
| `last_error` | null |
| Message `044c16a3-…` | `delivery_status`: SENT, external id present |

## Pre-rollout smoke (Step 3)
| Area | Result |
|------|--------|
| Instagram outbound (Dashboard) | **Not executed by agent** — requires operator |
| Instagram inbound | **Not executed by agent** |
| Facebook outbound | **Not executed by agent** |
| LINE outbound | **Not executed by agent** |
| Worker logs / secret leak | **Not executed by agent** |

Per project context: channels reported working before this task; DB baseline shows recent Instagram sends **DONE/SENT**.

## Channel Settings — Instagram (Step 4)
| Check | Result |
|-------|--------|
| INSTAGRAM row in DB | **Missing** |
| Test connection READY | **Not confirmed** — operator must save token + run Test connection in UI |
| Token pasted in report | **No** (never printed) |

**Required before DB path is meaningful:** `/dashboard/channel-settings` → Instagram → save Page Access Token + metadata → Test connection **READY**.

## Rollout (Step 5)
| Action | Result |
|--------|--------|
| Set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **Not applied** — Railway CLI unauthorized |
| Worker redeploy/restart | **Not applied** |

**Operator commands (after `railway login`):**
```powershell
cd "D:\Project\AI CODING\HUB Chat"
railway variable set HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK -s <worker-service>
railway redeploy -s <worker-service>
```

## Post-rollout smoke (Step 6)
**Not executed** — rollout not applied.

## DB sanity after send (Step 7)
**Not executed** — no post-rollout send. Pre-rollout baseline documented above.

## Worker log summary (Step 6)
**Not available** — Railway logs not accessed (CLI blocked).

Expected safe lines after successful rollout:
- `[worker] Instagram outbound runtime config mode { instagramRuntimeConfigMode: 'DB_WITH_ENV_FALLBACK' }`
- `Instagram outbound runtime config resolved` with `runtimeSource: 'db' | 'env'` (no raw tokens)

## Rollback (Step 8)
**Not needed** — rollout not applied.

If post-rollout fails:
```powershell
railway variable set HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=ENV_ONLY -s <worker-service>
railway redeploy -s <worker-service>
```

## Final status
| Item | Value |
|------|--------|
| Rollout result | **FAIL (incomplete / BLOCKED)** |
| Rollback needed | **No** |
| Railway Instagram mode after task | **Unchanged** (assumed `ENV_ONLY` until operator applies Step 5) |

## Known Issues / Risks
- Railway OAuth expired in this environment — blocks automated ops
- No INSTAGRAM `channel_settings` row — DB resolver will use env fallback until Step 4 completes
- Facebook DB token fingerprint empty while production works — expected under fallback mode

## Next Recommended Step
1. Operator: `railway login` → capture Step 2 snapshot (present/missing only).
2. Operator: Step 3 pre-smoke (all channels).
3. Operator: Step 4 Instagram Channel Settings → **READY**.
4. Operator: Step 5 set `DB_WITH_ENV_FALLBACK` + redeploy.
5. Operator: Step 6–7 post-smoke + DB check.
6. Update this report + `LATEST.md` with **PASS** or **FAIL** and merge docs PR.

## Guardrails Confirmation
- No secrets printed: yes
- No app code change: yes
- No migration / package / UI change: yes
- No inbound webhook change: yes (not touched)
- No LINE/Facebook runtime change: yes (not touched)

## Reviewer Notes for ChatGPT
- Treat this rollout as **not complete** until operator confirms Railway mode + post-smoke.
- Re-read `LATEST.md` after operator updates or follow-up docs PR.
