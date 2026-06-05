# CCP-3.4 — Production P1–P7 LINE Outbound Resolver Preflight (Sanitized)

**Date/time (UTC):** 2026-06-05T09:36:37Z (follow-up capture)
**Operator:** Agent A
**Mode:** Production preflight only — **not** controlled flag-on window
**Master / deploy SHA:** `3e8ae6ded89a8f588c26835fc9921428dddd0337` (`3e8ae6d`, PR **#179** merged)
**Evidence branch:** `docs/ccp-3-4-production-p1-p7-line-preflight-evidence`

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

## P1–P7 results (latest)

| # | Check | Result | Sanitized evidence |
|---|--------|--------|-------------------|
| **P1** | Latest `master` deployed (Vercel + Railway) | **PASS** | GitHub deployments: Vercel **Production** `3e8ae6d` @ `2026-06-04T10:14:52Z`; Railway **SmartKorp Hub Chat / production** `3e8ae6d` @ `2026-06-04T10:14:09Z` (state **success**). Vercel prod **Ready**; canonical domain `https://smartkorp-hub-chat.vercel.app`. |
| **P2** | Railway worker `/ready` healthy | **PASS** | Public worker `/ready` URL not published in repo. Railway CLI auth unavailable in non-interactive shell (`railway login` blocked). **Worker health confirmed indirectly:** P5 legacy outbound smoke completed end-to-end (queue job **DONE**, message **SENT**, `external_message_id` **present**) within ~2 minutes of send @ `2026-06-05T09:34:45Z`; Railway deploy **success** on `3e8ae6d`; no new outbound **PROCESSING** stall. |
| **P3** | Resolver flag OFF/absent in production | **PASS WITH NOTE** | **Vercel Production:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT** (`vercel env ls production`, names only). **Railway Worker:** variable name scan **not completed** — `railway login` failed in non-interactive Agent A shell (OAuth refresh invalid). No evidence of `true`/`1`/`yes`. Legacy P5 **SENT** on env path is consistent with flag **OFF**. Operator should confirm Railway variable **ABSENT/OFF** in interactive `railway variables` before flag-on. |
| **P4** | `DB_ONLY` not used | **PASS WITH NOTE** | **Vercel Production:** no `DB_ONLY`, no `HUBCHAT_*_RUNTIME_CONFIG_MODE`, no resolver flag in env name list. **Railway:** name scan **not completed** (same CLI auth block). No `DB_ONLY` observed on Vercel. P5 legacy env-path success implies no production `DB_ONLY` cutover for LINE in this window. |
| **P5** | Legacy LINE outbound smoke (env path) | **PASS** | ADMIN production Dashboard (Playwright + `.env.e2e.local`, `E2E_ALLOW_PRODUCTION=true`). LINE conversation selected; sent text `LINE resolver preflight test`. Send API **202**; no secret leak in response body. Read-only DB @ `2026-06-05T09:34:45Z+`: outbound queue job **DONE**, `last_error` **absent**; message `delivery_status` **SENT**; `external_message_id` **present**; smoke row found **yes**. |
| **P6** | Channel Settings LINE READY | **PASS** | ADMIN `/dashboard/channel-settings`: Reload **200**; LINE **Test connection** **200**, `lineStatus` **READY**, `ok` **true**, UI status **Ready**; secret inputs **write-only** (blank); no token/secret in API bodies. |
| **P7** | Ops Runtime — no new critical issue after P5 | **PASS** | ADMIN `/dashboard/ops` **Refresh** **PASS** (UI `ops-runtime-refresh`, API **200**, no secret leak). Read-only counts after smoke: outbound pending **0**, processing **0**, stale processing **0**, dead letter **26** (unchanged vs pre-smoke baseline **26**); outbox dead letter **0**; inbound dead letter **6**. No new stale PROCESSING or new dead letter from P5 smoke. |

---

## Follow-up session notes (2026-06-05)

| Item | Detail |
|------|--------|
| Railway `login` | Attempted; **blocked** in non-interactive shell (`Cannot login in non-interactive mode`; prior OAuth `invalid_grant`) |
| Browser preflight | Production ADMIN via E2E config (`E2E_BASE_URL` host `smartkorp-hub-chat.vercel.app`) |
| P5 DB verification | Read-only Supabase head/select only; no update/delete |
| Ops API headless fetch | `fetch('/api/ops/runtime')` from page context returned **500** once pre-nav; UI Refresh path returned **200** and is recorded for P7 |

---

## P1 detail — deploy alignment

| Surface | SHA (short) | State |
|---------|-------------|-------|
| `origin/master` | `3e8ae6d` | current |
| Vercel Production | `3e8ae6d` | Ready |
| Railway Worker | `3e8ae6d` | success |
| Align check | **match** | PASS |

---

## P3 / P4 — env name scan

**Vercel Production (names only):** `DEFAULT_TENANT_ID`, `SUPABASE_*`, `LINE_CHANNEL_*`, `FACEBOOK_*`, `INSTAGRAM_*`, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`, `HUBCHAT_PROFILE_AVATAR_*`, inbox/media keys.

**Absent on Vercel:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`, `HUBCHAT_*_RUNTIME_CONFIG_MODE`, `DB_ONLY`.

**Railway:** explicit variable name scan **pending** interactive operator CLI (no env changes).

---

## P5 — smoke verification (sanitized)

| Field | Value |
|-------|--------|
| Smoke text | `LINE resolver preflight test` |
| Send API status | **202** |
| Queue job (latest for smoke window) | **DONE** |
| `delivery_status` | **SENT** |
| `external_message_id` | **present** |
| `last_error` | **absent** |

---

## P7 — ops delta (sanitized)

| Metric | Pre-smoke (2026-06-05) | Post-smoke |
|--------|------------------------|------------|
| Outbound pending | 0 | 0 |
| Outbound processing | 0 | 0 |
| Outbound stale processing | 0 | 0 |
| Outbound dead letter | 26 | 26 (no delta) |
| Outbox dead letter | 0 | 0 |

---

## Secret leak check

**PASS** — No LINE token, channel secret, Authorization, Bearer, encrypted blob, webhook signature, or raw payload in evidence, Playwright capture, or DB probe stdout.

---

## Stop conditions

| Condition | Triggered? |
|-----------|------------|
| P3 resolver flag true/1/yes | **No** |
| P4 `DB_ONLY` in production | **No** (Vercel scan) |
| P5 DONE but not SENT | **No** |
| P5 `external_message_id` empty | **No** |
| P7 new critical issue after smoke | **No** |
| Secret leak | **No** |

---

## Final decision

**HOLD**

**Reason:**

- P5, P6, P7, P2 (indirect), and P1 are **PASS** for this follow-up session.
- **P3 / P4 Railway worker env name scan** remains **incomplete** because `railway login` cannot complete in this non-interactive Agent A shell.
- Until Railway confirms `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT/OFF** and no `DB_ONLY` / `DB_ONLY` runtime modes on the **worker**, do **not** declare **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING**.

**Not opened:** resolver flag, execute migration, `DB_ONLY`, flag-on pilot.

---

## Next steps (operator — interactive)

1. Run `railway login` locally (interactive) → `railway variables` (names only) → confirm resolver flag **ABSENT/OFF** and no `DB_ONLY`.
2. Optional: probe worker `/ready` if public health URL exists → expect **200** + `status: healthy`.
3. Append sanitized Railway P3/P4 PASS rows to this doc (or follow-up commit).
4. Re-evaluate: if Railway P3/P4 PASS → **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING** (still no flag-on until scheduled window).

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
