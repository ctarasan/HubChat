# CCP-3.8 — Limited Extended Monitoring Window Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Limited extended monitoring window **COMPLETE** — rolled back to **OFF / ABSENT**
**Result:** **PASS WITH NOTES**
**PR:** [#184](https://github.com/ctarasan/HubChat/pull/184)
**Master at capture:** `4d3c3e9` (PR **#183** merged — CCP-3.7 plan)
**Operator:** Chamnan / Operator — sanitized report to Agent A; no secrets in artifact
**Prior evidence:** [CCP-3.7 plan](./2026-06-06-ccp-3-7-line-resolver-extended-monitoring-plan.md) · [CCP-3.6 execution](./2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md) · [CCP-3.5 plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md) · [CCP-3.4 P1–P7](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md)

---

## Goal

Prepare execution evidence for a **limited extended monitoring window (1–2 hours)** on the Railway worker resolver flag, with global blast-radius monitoring (LINE + Facebook + Instagram). Record pre-window baseline, during-window checks, rollback, and final decision — **without** enabling the flag until operator explicitly says **GO EXTENDED MONITORING**.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Pre-window P1–P10 baseline templates | Long-running flag-on |
| During-window M1–M10 monitoring (after approval) | **DB_ONLY** |
| Rollback R1–R6 and stop conditions | Credential migration **`--execute`** |
| Sanitized evidence capture | Token/secret changes |
| Railway worker env change (operator only, after approval) | Vercel env change (not expected) |
| LINE sample smokes + FB/IG no-regression monitoring | Marketplace / Shopee / Lazada / TikTok |

**Duration:** **1–2 hours** hard stop. **Final flag state requirement:** **OFF / ABSENT** at window end.

---

## Guardrails

| Guardrail | Status (CCP-3.8) |
|-----------|------------------|
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** — operator only during approved window |
| Operator said **GO EXTENDED MONITORING** | **Yes** — window executed |
| Production env changes | **Operator only** (flag-on during window; **rolled back OFF / ABSENT**) |
| `DB_ONLY` | **Not used / prohibited** |
| `--execute` | **Not run / prohibited** |
| Token/secret changes | **None** |
| Runtime / API / worker / package / migration edits | **None** |
| Long-running flag-on | **NOT APPROVED** |
| Secrets/tokens/raw payloads/full external IDs in this doc | **None** (partial row/job IDs only) |

---

## Current production state (post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** — absent from Railway worker environment (R6 **PASS**) |
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** (P6 **PASS**) |
| `DB_ONLY` | **Not in use / prohibited** (P5 **PASS**) |
| Env change surface for flag | **Railway worker only** |
| Vercel deploy | **`4d3c3e9`** — Production **Ready** (P1 **PASS**) |
| Extended monitoring executed | **Yes** — limited window; **rolled back** |

---

## Agent A repo preflight (PF1–PF12)

Docs-only preflight before any operator window. **No production env changes by Agent A.**

| # | Check | Result | Sanitized evidence |
|---|--------|--------|-------------------|
| PF1 | `master` synced to latest `origin/master` | **PASS** | HEAD `4d3c3e9` — `git pull --ff-only` clean |
| PF2 | PR **#183** (CCP-3.7) included in `master` | **PASS** | Merge commit on `master` |
| PF3 | Production flag **OFF / ABSENT** before window | **PASS** | Operator P4; Agent A did **not** enable flag |
| PF4 | **`DB_ONLY`** not enabled | **PASS** | Operator P5; prohibited in guardrails |
| PF5 | **`--execute`** not used | **PASS** | Guardrails; no credential execute |
| PF6 | Ops menu test | **PASS** | Operator report: Ops menu test **PASS** |
| PF7 | Railway worker healthy before window | **PASS** | Operator P3 |
| PF8 | LINE outbound baseline | **PASS** | CCP-3.6 rollback recovery smoke **SENT** referenced |
| PF9 | Facebook / Instagram monitoring baseline | **PASS** | No known active regression; CCP-3.6 FB/IG no regression |
| PF10 | Rollback owner assigned | **PASS** | **Chamnan / Operator** (P10) |
| PF11 | Blast radius acknowledged | **PASS** | Global Railway worker flag → LINE + FB + IG under **`DB_WITH_ENV_FALLBACK`** |
| PF12 | Decision before flag-on | **PASS** | Operator **GO EXTENDED MONITORING** received; window executed per plan |

---

## Global blast-radius reminder

| Item | Detail |
|------|--------|
| Flag scope | **Global** on Railway worker → LINE, Facebook, Instagram under **`DB_WITH_ENV_FALLBACK`** |
| Pilot focus | LINE sample outbound smokes |
| Required monitoring | **Facebook and Instagram** no-regression for full window duration |
| Literal enable | Only `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (lowercase `true`) |

---

## Pre-window checklist P1–P10

Complete **immediately before** flag enable. **CCP-3.8 operator verification:** P1–P10 **PASS** (P2 **PASS WITH NOTE**).

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | Latest `master` on **Vercel** | Production **Ready** on approved commit | **PASS** | Vercel Production **Ready** on `4d3c3e9` |
| P2 | Latest `master` on **Railway worker** | Worker **active** on approved commit | **PASS WITH NOTE** | Worker **active** after PR **#183** deployment; latest deployment **successful**; commit SHA **not shown** in Railway UI |
| P3 | Railway worker healthy | `/ready` or equivalent **healthy** | **PASS** | Health confirmed |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unset or `false` (names only) | **PASS** | Flag **OFF / ABSENT** |
| P5 | No **`DB_ONLY`** in production | Not found in Railway worker variables | **PASS** | No **DB_ONLY** |
| P6 | Runtime modes | LINE / Facebook / Instagram: **DB_WITH_ENV_FALLBACK** | **PASS** | All three **DB_WITH_ENV_FALLBACK** |
| P7 | Channel Settings LINE / Facebook / Instagram | All **READY** | **PASS** | LINE / Facebook / Instagram **READY** |
| P8 | Ops Runtime clean; queue/outbox baseline | No new critical issue; sanitized counts recorded | **PASS** | Baseline recorded (counts not duplicated here) |
| P9 | Worker logs clean | No resolver / auth / provider errors | **PASS** | No resolver / auth / provider errors |
| P10 | Rollback owner + window timing | Owner assigned; **1–2 h** duration and **hard stop time** documented | **PASS** | Rollback owner: **Chamnan / Operator**; hard stop: **12:30 ICT** |

**Pre-window gate:** P1–P10 **PASS** (P2 note only) + operator **GO EXTENDED MONITORING** → may enable flag.

### Ops snapshot (operator — sanitized)

| Metric | Status |
|--------|--------|
| Queue / outbox baseline | **Recorded** (sanitized form per operator; numeric counts not duplicated in this artifact) |
| Ops delta vs prior | **No new critical issue** (P8 **PASS**) |

---

## Operator approval gate

| Item | Status |
|------|--------|
| CCP-3.7 decision | **READY TO SCHEDULE LIMITED EXTENDED MONITORING WINDOW** |
| Pre-window P1–P10 complete | **Yes** — **PASS** (P2 **PASS WITH NOTE**) |
| Hard stop time | **12:30 ICT** |
| Rollback owner | **Chamnan / Operator** |
| Operator command **GO EXTENDED MONITORING** | **Received** |
| Flag enable authorized | **Yes** — during limited window only |
| Window executed | **Yes** |
| Rollback completed | **Yes** — final flag **OFF / ABSENT** |

---

## During-window monitoring M1–M10

Executed after **GO EXTENDED MONITORING** and P1–P10 **PASS**. Operator-run; sanitized evidence recorded by Agent A.

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | Flag **ON** + Railway worker redeployed | Operator set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true`; redeploy confirmed | **PASS** | Worker redeploy after flag-on confirmed |
| M2 | Worker healthy after enable | `/ready` OK; no restart loop | **PASS** | Health confirmed after redeploy |
| M3 | **LINE** outbound during window | Message row **OUTBOUND**; `external_message_id` **present**; `metadata_json.delivery_status` **SENT** | **PASS** | Latest LINE **OUTBOUND** row `973bef18`; `created_at` `2026-06-06 07:51:59+00`; `external_message_id_present` = true; `delivery_status` = **SENT** |
| M4 | Queue job terminal | `message.outbound.requested` **DONE**; `last_error` **empty** | **PASS** | Latest job `3a3eeb52`; `created_at` `2026-06-06 07:51:59+00`; `status` = **DONE**; `last_error_empty` = true |
| M5 | Ops Runtime clean | No new stale **PROCESSING**; no unexpected active queue/outbox regression | **PASS WITH NOTE** | Queue pending 0, processing 0, stale processing 0; outbox pending 0, processing 0, stale processing 0, dead letter 0. Warning driven by **historical** dead-letter baseline only: inbound dead letter = 6; outbound queue dead letter = 26. No active pending/stale processing regression observed |
| M6 | **Facebook** monitoring | No regression attributable to window | **PASS WITH NOTE** | No new Facebook suspected FAILED/ERROR/exception rows after flag-on. Latest Facebook outbound rows were **historical before the window**. **No new Facebook traffic observed during the window** |
| M7 | **Instagram** monitoring | No regression attributable to window | **PASS WITH NOTE** | No new Instagram suspected FAILED/ERROR/exception rows after flag-on. Latest Instagram outbound rows were **historical before the window**. **No new Instagram traffic observed during the window** |
| M8 | Periodic checks during window | Checks recorded during limited window | **PASS** | Operator monitoring during limited window; no stop condition triggered |
| M9 | Secret / token / raw payload leak check | None in UI, logs, docs, chat | **PASS** | No leak reported during window |
| M10 | Hard stop or operator stop | Window ended; rollback initiated | **PASS** | Rollback completed; final flag **OFF / ABSENT** |

| Field | Value |
|-------|--------|
| Window LINE sample (UTC) | `2026-06-06 07:51:59+00` |
| Rollback recovery smoke (UTC) | `2026-06-06 08:03:48+00` |
| Planned duration | 1–2 hours (limited window) |
| Window owner | **Chamnan / Operator** |
| Rollback owner | **Chamnan / Operator** |
| Hard stop (ICT) | **12:30** (window ended with rollback per plan) |
| `resolutionPath` / diagnostic codes (LINE) | Not cited in operator report |

---

## Operator window evidence (sanitized)

| Capture | Evidence |
|---------|----------|
| Railway worker redeploy after flag-on | **PASS** (M1) |
| Worker healthy after redeploy | **PASS** (M2) |
| **LINE** message row (during window) | Row `973bef18`; **OUTBOUND**; `created_at` `2026-06-06 07:51:59+00`; `external_message_id_present` = true; `delivery_status` = **SENT** |
| Queue job (during window) | Job `3a3eeb52`; `message.outbound.requested`; `created_at` `2026-06-06 07:51:59+00`; **DONE**; `last_error_empty` = true |
| Ops Runtime during window | **PASS WITH NOTE** — active queues clean; historical dead-letter baseline only (M5) |
| **Facebook** monitoring | **PASS WITH NOTE** — no new traffic during window; no new suspected failures (M6) |
| **Instagram** monitoring | **PASS WITH NOTE** — no new traffic during window; no new suspected failures (M7) |
| Rollback: flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **removed** from Railway worker environment (R1) |
| Rollback: worker redeployed | **PASS** (R2) |
| Rollback: worker healthy | **PASS** (R3) |
| Post-rollback LINE recovery smoke | Row `fd117c7a`; **OUTBOUND**; `created_at` `2026-06-06 08:03:48+00`; `external_message_id_present` = true; job `6661d60f` **DONE**; `last_error_empty` = true (R4) |
| Final flag state | **OFF / ABSENT** — variable **absent** from Railway worker environment (R6) |

---

## Rollback / end-of-window R1–R6

Execute at hard stop, on stop condition, or if operator ends window early.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** | Flag removed or `false` | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **removed** from Railway worker environment |
| R2 | Redeploy Railway worker | Redeploy confirmed | **PASS** | Worker redeploy after rollback confirmed |
| R3 | Worker healthy | `/ready` OK | **PASS** | Health confirmed after rollback redeploy |
| R4 | LINE recovery smoke (flag-off) | **SENT**; message **OUTBOUND**; queue **DONE**; `last_error` empty | **PASS** | Latest LINE **OUTBOUND** row `fd117c7a`; `created_at` `2026-06-06 08:03:48+00`; `external_message_id_present` = true; job `6661d60f`; `created_at` `2026-06-06 08:03:48+00`; **DONE**; `last_error_empty` = true |
| R5 | Ops Runtime after rollback | No new critical issue | **PASS** | Ops Runtime clean after rollback |
| R6 | Final flag state confirmed | **OFF / ABSENT** | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **absent** from Railway worker environment |

---

## Stop conditions (immediate rollback)

| Condition | Action |
|-----------|--------|
| LINE outbound failure | Rollback R1–R6 |
| Queue not **DONE** | Rollback |
| `metadata_json.delivery_status` not **SENT** | Rollback |
| `external_message_id` missing | Rollback |
| Resolver / auth / provider error in logs | Rollback |
| Worker crash / restart loop | Rollback |
| Ops Runtime **critical** issue | Rollback |
| Facebook / Instagram regression | Rollback |
| Secret / token / raw payload leak | Rollback + SEC incident |
| Rollback path or owner uncertainty | **Hold / rollback** |
| Window exceeds **1–2 h** without separate approval | Rollback |

---

## Evidence capture format (sanitized)

| Field | Record |
|-------|--------|
| Pre-window P1–P10 results | PASS/FAIL per row; metadata only |
| Ops baseline / delta | Counts only |
| M1–M10 results | PASS/FAIL; diagnostic codes only |
| LINE smoke outcomes | Delivery status labels; **no** secrets |
| FB/IG impact | none / issue summary (no raw secret logs) |
| Rollback R1–R6 | PASS/FAIL |
| Final flag state | **OFF / ABSENT** (required) |
| Window decision | See final decision options below |

Attach [`docs/channel-connect-outbound-rollout-evidence-pack.md`](../../channel-connect-outbound-rollout-evidence-pack.md) §4–§5 when executed.

---

## Final decision (CCP-3.8)

**PASS WITH NOTES — LIMITED EXTENDED MONITORING WINDOW COMPLETE**

| Item | State |
|------|--------|
| CCP-3.8 extended monitoring window | **COMPLETE** |
| Result | **PASS WITH NOTES** |
| Final production flag state | **OFF / ABSENT** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **Absent** from Railway worker environment |
| `DB_ONLY` | **Not used / prohibited** |
| `--execute` | **Not used / prohibited** |
| Long-running flag-on | **NOT APPROVED** |
| Rollback owner | **Chamnan / Operator** |
| Product code changes | **None** |

**Notes (PASS WITH NOTES rationale):**

- M5: Ops Runtime warning driven by **historical** dead-letter baseline only; no active pending/stale processing regression.
- M6 / M7: Facebook and Instagram **PASS WITH NOTE** — no new channel traffic during window; no new suspected failures after flag-on (not active channel exercise).
- `resolutionPath` / diagnostic codes not cited in operator report.

**Not approved / not recommended:**

- Long-running flag-on — **NOT APPROVED**
- **`DB_ONLY`** — **not used / prohibited** (do not enable)

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-3.7 plan](./2026-06-06-ccp-3-7-line-resolver-extended-monitoring-plan.md) | Option C template and decision matrix |
| [CCP-3.6 execution](./2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md) | Prior short window evidence |
| [Evidence pack](../../channel-connect-outbound-rollout-evidence-pack.md) | §4–§5 pilot rows |

---

## Verification (CCP-3.8 docs-only)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| Resolver flag during window | **Operator enabled**; final state **OFF / ABSENT** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **PASS** |
| `npm run build` | **PASS** |
