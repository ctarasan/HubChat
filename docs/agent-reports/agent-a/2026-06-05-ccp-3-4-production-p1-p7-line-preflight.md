# CCP-3.4 — Production P1–P7 LINE Outbound Resolver Preflight (Sanitized)

**Date/time (UTC):** 2026-06-05T09:14:54Z
**Operator:** Agent A
**Mode:** Production preflight only — **not** controlled flag-on window
**Master at check:** `3e8ae6ded89a8f588c26835fc9921428dddd0337` (`3e8ae6d`, PR **#179** merged)

---

## Guardrails confirmation

| Guardrail | Status |
|-----------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` set to true/1/yes | **Not performed** |
| `--execute` / `--dry-run=false` credential migration | **Not performed** |
| `DB_ONLY` runtime mode | **Not set / not used** |
| Flag-on pilot window | **Not opened** |
| Env mutation (Vercel/Railway) | **None** |
| Secrets in this artifact | **None** (status labels only) |

---

## P1–P7 results

| # | Check | Result | Sanitized evidence |
|---|--------|--------|-------------------|
| **P1** | Latest `master` deployed (Vercel + Railway) | **PASS** | GitHub deployments: Vercel **Production** `3e8ae6d` @ `2026-06-04T10:14:52Z`; Railway **SmartKorp Hub Chat / production** `3e8ae6d` @ `2026-06-04T10:14:09Z` (`Deployed to Railway`, state **success**). Vercel prod deployment **Ready**, alias includes `smartkorp-hub-chat-git-master-…`. Local `master` HEAD matches: `3e8ae6d`. |
| **P2** | Railway worker `/ready` healthy | **PASS WITH NOTE** | Public `/ready` URL not available in repo; Railway CLI session **expired** (`railway login` required). Indirect signals: Railway deploy **success**; outbound `queue_jobs` recent terminal **DONE**; ops baseline pending/processing **0**; no stale outbound PROCESSING. Direct HTTP `/ready` **not verified** this session. |
| **P3** | Resolver flag OFF/absent in production | **PASS WITH NOTE** | **Vercel Production:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT** (`vercel env ls production`). **Railway Worker:** variable names **not verified** (CLI auth expired). No flag-on performed. Production worker startup log `channelConnectResolverEnabled: false` **not captured** this session. |
| **P4** | `DB_ONLY` not used | **PASS WITH NOTE** | **Vercel Production:** no `DB_ONLY`, no `HUBCHAT_*_RUNTIME_CONFIG_MODE`, no `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` in env name list. **Railway:** runtime env name scan **not verified** (CLI auth expired). No `DB_ONLY` observed on Vercel. |
| **P5** | Legacy LINE outbound smoke (env path) | **NOT COMPLETED** | Session did **not** send new Dashboard test text `LINE resolver preflight test`. Read-only DB: latest LINE outbound before capture was **2026-06-04T03:36:14Z** (`delivery_status` **SENT**, `external_message_id` **present**) — prior smoke, **not** this preflight ticket. **P5 gate not satisfied for controlled window planning.** |
| **P6** | Channel Settings LINE READY | **PASS WITH NOTE** | Production `/dashboard/channel-settings` UI test-connection **not executed** (no ADMIN browser session in Agent A shell). Read-only `channel_settings`: LINE **enabled=true**, secret fingerprint keys **2** (write-only metadata), updated **2026-06-04T03:13:32Z**. Dashboard Reload + LINE Test connection **deferred to operator browser**. |
| **P7** | Ops Runtime queue/outbox baseline | **PASS WITH NOTE** | Read-only baseline @ capture: outbound pending **0**, processing **0**, stale processing **0**, dead letter **26**; inbound dead letter **6**; outbox pending/processing/dead letter **0/0/0**. No **new** stale PROCESSING or **new** dead letter attributable to P5 (P5 not run). Historical outbound dead letter above PROD-D1 baseline **19** — warn-level backlog, not active stall. Dashboard `/dashboard/ops` Refresh **not executed** in browser; counts from read-only Supabase head queries + RPC depth/lag. |

---

## P1 detail — deploy alignment

| Surface | SHA (short) | State | Notes |
|---------|-------------|-------|-------|
| `origin/master` | `3e8ae6d` | current | PR #179 merged |
| Vercel Production | `3e8ae6d` | Ready | Canonical domain `https://smartkorp-hub-chat.vercel.app` |
| Railway Worker | `3e8ae6d` | success | GitHub env: `SmartKorp Hub Chat / production` |
| Align check | **match** | PASS | Vercel + Railway + `master` on same commit |

---

## P3 / P4 — production env name scan (Vercel only)

**Vercel Production variables reviewed (names only):** `DEFAULT_TENANT_ID`, `SUPABASE_*`, `LINE_CHANNEL_*`, `FACEBOOK_*`, `INSTAGRAM_*`, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`, `HUBCHAT_PROFILE_AVATAR_*`, inbox/media keys.

**Absent on Vercel (expected for preflight):**

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`
- `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` / `HUBCHAT_*_RUNTIME_CONFIG_MODE`
- `DB_ONLY`

**Railway variable name scan:** blocked this session (CLI unauthorized). Operator must confirm same absent/OFF set on worker before flag-on.

---

## P5 / P7 — read-only production signals (no IDs)

| Signal | Value |
|--------|--------|
| Latest outbound queue job status (sample) | **DONE**, `last_error` **absent** |
| Latest LINE outbound `delivery_status` (historical) | **SENT** |
| Latest LINE `external_message_id` | **present** |
| New preflight smoke message this session | **not sent** |

---

## Secret leak check

**PASS** — No LINE token, channel secret, Authorization, Bearer, encrypted blob, webhook signature, or raw payload recorded in this artifact or probe stdout.

---

## Stop conditions

| Condition | Triggered? |
|-----------|------------|
| P3 resolver flag true/1/yes | **No** (Vercel absent; Railway unverified) |
| P4 `DB_ONLY` in production | **No** (Vercel absent) |
| P5 DONE but not SENT | **N/A** (P5 smoke not run) |
| P5 `external_message_id` empty after smoke | **N/A** |
| P7 new critical issue after smoke | **N/A** (P5 not run) |
| Secret leak in output | **No** |

---

## Final decision

**HOLD**

**Reason:**

- P1 deploy alignment **PASS** on `3e8ae6d`.
- P5 **NOT COMPLETED** — required fresh legacy-path LINE outbound smoke (`LINE resolver preflight test`) not sent/verified this session.
- P2 `/ready` HTTP, P3/P4 Railway env, and P6 Dashboard test-connection require **operator browser / `railway login`** completion.
- Resolver flag remains **off**; no execute; no `DB_ONLY`; no flag-on window opened.

**Not ready for:** `READY FOR CONTROLLED FLAG-ON WINDOW PLANNING` until P5–P7 browser checks complete and Railway P3/P4 confirmed.

---

## Next steps (operator)

1. `railway login` → confirm worker `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT/OFF** and no `DB_ONLY` / `DB_ONLY` runtime modes on Railway.
2. Hit worker `/ready` → expect HTTP **200**, JSON `status: healthy` (if public health URL configured).
3. ADMIN: `/dashboard/channel-settings` → Reload → LINE **Test connection** → confirm **READY** (no secret leak in UI).
4. ADMIN: send LINE test `LINE resolver preflight test` via legacy Dashboard path (flag **off**).
5. Read-only verify: latest outbound job **DONE**, message `delivery_status` **SENT**, `external_message_id` **present**.
6. ADMIN: `/dashboard/ops` → Refresh → confirm no new stale PROCESSING / critical LINE-related issue.
7. Append sanitized PASS rows or open follow-up evidence doc; only then schedule `DB_WITH_ENV_FALLBACK` controlled window.

**Reference:** [`docs/channel-connect-line-outbound-resolver-pilot-checklist.md`](../../channel-connect-line-outbound-resolver-pilot-checklist.md)

---

## Verification (docs PR)

| Check | Result |
|-------|--------|
| Docs-only diff | PASS |
| `git diff --check` | PASS |
| Hidden/bidi scan | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
