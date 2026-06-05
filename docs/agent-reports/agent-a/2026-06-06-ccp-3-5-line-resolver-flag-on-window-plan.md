# CCP-3.5 — Controlled LINE Resolver Flag-On Window Plan

**Agent:** A  
**Date:** 2026-06-06  
**Master at planning:** `16c5843` (PR #180 merged)  
**Prior evidence:** [CCP-3.4 production P1–P7 preflight](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md), [CCP-3.4-SEC remediation](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md)

---

## Goal

Produce a **docs-only** controlled flag-on window plan for the LINE outbound resolver pilot. Define pre-window baseline, exact env change discipline, during-window smoke, rollback, stop conditions, and post-window evidence — **without** enabling `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` and **without** executing production smokes in this phase.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Planning document for a future scheduled ops window | Actual flag enablement |
| Sanitized blast-radius analysis from code inspection | Runtime / API / worker / package / migration changes |
| Checklists operators can follow when separately approved | Credential `--execute` |
| Rollback and stop-condition definitions | **DB_ONLY** mode |
| Post-window evidence template (empty placeholders) | Marketplace / Shopee / Lazada / TikTok |
| Security guardrails (no secrets in docs/chat) | Facebook / Instagram resolver pilot (unless global blast radius requires monitoring) |

**Pilot intent:** LINE outbound resolver validation first. **Code reality:** the resolver flag is **global on the Railway worker** (see Blast radius).

---

## Non-goals

- Enabling `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` in any environment
- Changing production Railway or Vercel env vars
- Running production LINE / Facebook / Instagram smokes during CCP-3.5
- Rotating `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` (remains **PLANNED ONLY** per SEC remediation)
- Authorizing credential migration `--execute`
- Committing tokens, secrets, raw payloads, or full external provider IDs

---

## Guardrails (hard stops)

| Rule | Status in CCP-3.5 |
|------|-------------------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` | **Not set** — planning only |
| Production env changes | **Prohibited** in this phase |
| `DB_ONLY` on any provider | **Prohibited** |
| Credential migration `--execute` | **Prohibited** until separate approved window |
| Production outbound smokes | **Prohibited** in this phase |
| Runtime / API / worker / migration edits | **Prohibited** |
| Paste token / secret / raw payload / full external IDs | **Prohibited** in UI, logs, docs, chat |
| Marketplace channels | **Paused** |

**Security note:** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` was not rotated in CCP-3.4-SEC. Do not enable the resolver flag until operator approval **and** a separate execution phase; treat encryption-key rotation as a future controlled phase if required before wider DB-only cutover.

---

## Blast radius analysis (code inspection, sanitized)

Inspection targets: `src/lib/channelConnectRuntimeMode.ts`, `src/worker/main.ts`, `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts`, `docs/channel-connect-outbound-rollout-readiness.md`.

### Where the flag is read

| Location | Behavior |
|----------|----------|
| `isChannelConnectResolverEnabled()` in `channelConnectRuntimeMode.ts` | Returns `true` **only** when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` trimmed value equals literal `"true"`. `"1"`, `"TRUE"`, `"yes"` → **disabled**. |
| `src/worker/main.ts` | Single `channelConnectResolverEnabled` value passed to **LINE, Facebook, and Instagram** outbound adapter resolvers. `SupabaseChannelConnectionRepository` is instantiated **only when flag is on**. |
| Vercel web / API routes | **No reads found** — outbound send runs on **Railway worker**, not Vercel. |

### Answers to blast-radius questions

| Question | Finding |
|----------|---------|
| **(a) LINE outbound only?** | **No.** Pilot **intent** is LINE-first, but the flag is **one global worker switch** for all three outbound resolvers. |
| **(b) Global across LINE / Facebook / Instagram?** | **Yes**, when flag is `true` **and** each provider’s runtime mode is `DB_WITH_ENV_FALLBACK` or `DB_ONLY`. Production baseline (CCP-3.4 P4): all three providers already use **`DB_WITH_ENV_FALLBACK`** — enabling the flag activates CCP-1 DB read attempts for **LINE, Facebook, and Instagram** outbound on the worker. |
| **(c) Redeploy surface?** | **Railway worker only** for flag change. Worker restart/redeploy required so startup log reflects new value. **Vercel redeploy not required** for this flag alone (flag not consumed on Vercel for outbound resolution). |
| **(d) Does `DB_WITH_ENV_FALLBACK` remain active?** | **Yes.** Production already runs `DB_WITH_ENV_FALLBACK` for LINE / Facebook / Instagram (CCP-3.4 P4). CCP-3.5 planning **does not** change modes. **`DB_ONLY` remains prohibited.** |
| **(e) DB credential read fails?** | With `DB_WITH_ENV_FALLBACK`: worker logs `legacy_fallback` (diagnostic codes e.g. `channel_connect_db_unavailable`, `channel_connect_error`); resolution continues via legacy `channel_settings` + ENV path. With **`DB_ONLY`** (prohibited): outbound would **fail hard** — do not use. |

### Operational implication

During the future flag-on window, operators must:

1. Treat LINE as the **primary smoke target**.
2. **Monitor Facebook and Instagram** for unexpected outbound failures or resolver/auth errors because the flag is global.
3. Roll back immediately if any provider regresses (see Stop conditions).

---

## Pre-window baseline checklist

Complete **before** any env change. All items must pass. Evidence: metadata only (UUIDs, diagnostic codes, counts — no secrets).

| # | Check | Pass criteria | Evidence field |
|---|--------|---------------|----------------|
| B1 | Latest `master` deployed | Vercel + Railway worker on approved commit SHA | Vercel SHA: _____ Railway SHA: _____ |
| B2 | Railway worker healthy | `/ready` → healthy | Link/ticket: _____ |
| B3 | Resolver flag OFF / absent | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unset or `false` on Railway worker; Vercel absent OK | Worker log: `channelConnectResolverEnabled: false` |
| B4 | **No `DB_ONLY`** | `HUBCHAT_*_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` for LINE / Facebook / Instagram | Modes recorded (names only): _____ |
| B5 | Channel Settings LINE READY | Dashboard **Channel Settings → LINE** enabled / ready | Screenshot link (no secrets): _____ |
| B6 | Ops Runtime clean | No new critical outbound queue / outbox issue vs prior baseline | Pending / processing / stale / dead-letter counts: _____ |
| B7 | LINE legacy path SENT | Controlled LINE text via **flag-off** path: queue **DONE**, `delivery_status` **SENT**, `external_message_id` **present** | Message id: _____ Job id: _____ |
| B8 | CCP-3.4 P1–P7 + SEC R1–R8 | Prior reports **PASS**; remediation **DONE** | Report links in header |
| B9 | Rollback owner assigned | Named operator + comms channel for window | Owner: _____ |

**Pre-window gate:** B1–B9 all PASS → eligible to **schedule** window (not to execute from this doc alone).

---

## Exact env change checklist (execution phase only — not authorized here)

**Set on Railway worker service only.** Do **not** set on Vercel unless a future runbook explicitly requires it (current code: **not required**).

| Step | Variable | Value | Notes |
|------|----------|-------|-------|
| E1 | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | `true` | Literal lowercase `true` only |
| E2 | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` | Already production baseline; confirm unchanged |
| E3 | Facebook / Instagram modes | **Unchanged** unless runbook update | Production: `DB_WITH_ENV_FALLBACK` — flag-on affects their resolver path |
| E4 | Redeploy / restart | Railway worker | Confirm startup: `channelConnectResolverEnabled: true` |

**Explicit prohibitions during window:**

| Prohibited action | Reason |
|-------------------|--------|
| `DB_ONLY` on any provider | Hard fail on DB miss; out of pilot scope |
| Changing LINE / Facebook / Instagram tokens or secrets | Confounds resolver vs credential attribution |
| Credential migration `--execute` | Separate approved window |
| Leaving flag `true` outside approved window | Uncontrolled global blast radius |

**Do not change in this planning phase:** no env vars were modified for CCP-3.5.

---

## During-window smoke checklist (future execution — not run in CCP-3.5)

Execute only in the **separately approved** ops window with rollback owner on standby.

| # | Step | Expected |
|---|------|----------|
| W1 | Deploy / restart Railway worker after E1 | Service healthy; `/ready` OK |
| W2 | Confirm startup log | `channelConnectResolverEnabled: true` |
| W3 | Send **one** controlled LINE outbound test message | Customer receives text in LINE |
| W4 | Queue job | Terminal status **DONE**; `last_error` null |
| W5 | Message row | `delivery_status` = **SENT** |
| W6 | Provider id | `external_message_id` **present** (non-empty) |
| W7 | Ops Runtime | No new critical queue / outbox issue vs B6 baseline |
| W8 | Worker logs | No resolver / auth / provider error; no secret substrings in logs |
| W9 | Config source (LINE) | Prefer `resolutionPath: channel_connect_db` when DB credential expected; document if `legacy_fallback` |
| W10 | Facebook / Instagram (global flag) | No new outbound errors in worker logs or Ops Runtime for non-LINE providers during window |

| Field | Value |
|-------|--------|
| Window start (local / UTC) | |
| Operator | |
| Test conversation id | |
| Test message id | |
| Queue job id | |
| Smoke result | PASS / FAIL |
| Log link (placeholder) | |

---

## Rollback checklist

Execute **immediately** on any stop condition or at window end.

| # | Step | Expected |
|---|------|----------|
| RB1 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` = `false` or **remove** variable | Flag off |
| RB2 | Redeploy / restart Railway worker | Startup: `channelConnectResolverEnabled: false` |
| RB3 | Confirm worker healthy | `/ready` OK |
| RB4 | LINE recovery smoke via legacy / fallback path | Queue **DONE**; `delivery_status` **SENT**; `external_message_id` **present** |
| RB5 | Preserve DB rows | Do **not** delete `channel_connections` / `channel_credentials` |
| RB6 | Record sanitized evidence | Ticket / log links only — no secret content |

| Field | Value |
|-------|--------|
| Rollback completed at | |
| Recovery message id | |
| Recovery job id | |
| Rollback smoke result | PASS / FAIL |

---

## Stop conditions (immediate rollback)

| Condition | Action |
|-----------|--------|
| LINE outbound failed | Rollback RB1–RB6 |
| Queue not **DONE** | Rollback |
| `delivery_status` not **SENT** | Rollback |
| `external_message_id` missing | Rollback |
| Worker crash / restart loop | Rollback |
| Resolver error in worker logs | Rollback |
| Provider auth / token error | Rollback |
| Ops Runtime new critical issue | Rollback |
| Facebook / Instagram error attributable to window (global flag) | Rollback |
| Any token / secret leak in UI, logs, docs, or chat | Rollback + SEC incident procedure |

---

## Post-window evidence template

Fill after a **future** executed window (not in CCP-3.5).

| Field | Value |
|-------|--------|
| Phase | CCP-3.5 execution (future) |
| Master SHA at window | |
| Railway worker SHA at window | |
| Window start / end (local + UTC) | |
| Operator(s) | |
| Flag enabled at | |
| Flag disabled at | |
| LINE smoke result | PASS / FAIL |
| Rollback executed? | yes / no |
| Rollback smoke result | PASS / FAIL / N/A |
| `resolutionPath` observed (LINE) | `channel_connect_db` / `legacy_fallback` / other: _____ |
| FB / IG impact | none observed / issue: _____ |
| Ops delta vs baseline | |
| Secret leak check | PASS / FAIL |
| Final window decision | GO / NO-GO |

Attach: [`docs/channel-connect-outbound-rollout-evidence-pack.md`](../../channel-connect-outbound-rollout-evidence-pack.md) §4–§5 rows when execution occurs.

---

## Decision criteria

| Outcome | When |
|---------|------|
| **READY FOR SCHEDULED CONTROLLED FLAG-ON WINDOW** | Plan complete; blast radius documented; rollback path complete; pre-window baseline defined; SEC remediation closed; review passes |
| **HOLD** | Blast radius unclear; rollback incomplete; baseline gaps; unresolved SEC items |

### CCP-3.5 planning decision

**READY FOR SCHEDULED CONTROLLED FLAG-ON WINDOW**

Rationale:

- CCP-3.4 production P1–P7 **PASS** with resolver flag **OFF**.
- CCP-3.4-SEC remediation **DONE** (R1–R8 **PASS**); encryption key rotation **PLANNED ONLY**.
- Blast radius is **clear**: global worker flag; Railway-only redeploy; `DB_WITH_ENV_FALLBACK` preserved; legacy fallback on DB miss/failure.
- Rollback path is **complete** (flag off + worker restart + legacy LINE smoke).
- Global FB/IG monitoring requirement is **explicit** despite LINE-first pilot intent.

**Actual flag-on execution is not approved by this document.** Requires separate operator approval and a distinct execution phase (CCP-3.5-exec or equivalent).

---

## Authorization statement

**This plan does not authorize execution and does not enable the resolver flag.**

CCP-3.5 is documentation only. No production env changes, no smokes, no `--execute`, and no `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` were applied during this phase.

---

## Related docs

| Document | Use |
|----------|-----|
| [`docs/channel-connect-line-outbound-resolver-pilot-checklist.md`](../../channel-connect-line-outbound-resolver-pilot-checklist.md) | Operator P1–P7 + §3 flag-on steps |
| [`docs/channel-connect-outbound-rollout-readiness.md`](../../channel-connect-outbound-rollout-readiness.md) | Env inventory + rollback |
| [`docs/channel-connect-outbound-rollout-evidence-pack.md`](../../channel-connect-outbound-rollout-evidence-pack.md) | Evidence templates |
| [`docs/channel-connect-outbound-rollout-operator-smoke.md`](../../channel-connect-outbound-rollout-operator-smoke.md) | Multi-provider smoke reference |

---

## Verification (CCP-3.5 docs-only)

| Check | Result |
|-------|--------|
| Docs-only (no runtime edits) | **PASS** |
| Resolver flag enabled | **No** |
| Secrets / tokens / raw payloads in doc | **No** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |
