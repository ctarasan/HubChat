# CCP-3.8 — Limited Extended Monitoring Window Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Pre-window baseline **complete** — **awaiting explicit GO EXTENDED MONITORING**
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

| Guardrail | Status (CCP-3.8 Agent A session) |
|-----------|----------------------------------|
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** |
| Operator said **GO EXTENDED MONITORING** | **No** |
| Production env changes | **None** |
| `DB_ONLY` | **Not used / prohibited** |
| `--execute` | **Not run** |
| Token/secret changes | **None** |
| Runtime / API / worker / package / migration edits | **None** |
| Long-running flag-on | **NOT APPROVED** |
| Secrets/tokens/raw payloads/full external IDs in this doc | **None** |

---

## Current production state (verified pre-window)

| Item | State |
|------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (P4 **PASS**) |
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** (P6 **PASS**) |
| `DB_ONLY` | **Not in use** (P5 **PASS**) |
| Env change surface for flag | **Railway worker only** |
| Vercel deploy | **`4d3c3e9`** — Production **Ready** (P1 **PASS**) |
| Extended monitoring executed | **No** |

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
| Operator command **GO EXTENDED MONITORING** | **Not received** |
| Flag enable authorized | **No** |

**Do not proceed to flag-on until operator explicitly says: `GO EXTENDED MONITORING`**

---

## During-window monitoring M1–M10

Execute **only** after **GO EXTENDED MONITORING** and P1–P10 **PASS**. **Not executed in this Agent A session.**

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | Flag **ON** + Railway worker redeployed | Operator set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true`; redeploy confirmed | **NOT RUN** | |
| M2 | Worker healthy after enable | `/ready` OK; no restart loop | **NOT RUN** | |
| M3 | **LINE** outbound sample verified | Queue **DONE**; `metadata_json.delivery_status` **SENT**; `external_message_id` **present** | **NOT RUN** | Repeat start / mid / pre-rollback per plan |
| M4 | Ops Runtime clean | No new **critical** issue vs P8 baseline | **NOT RUN** | |
| M5 | Worker logs clean | No resolver / auth / provider errors; no secret substrings | **NOT RUN** | |
| M6 | **Facebook** monitoring | No regression attributable to window | **NOT RUN** | |
| M7 | **Instagram** monitoring | No regression attributable to window | **NOT RUN** | |
| M8 | Periodic checks during window | Checks recorded at agreed intervals (e.g. 15–30 min) during **1–2 h** window | **NOT RUN** | |
| M9 | Secret / token / raw payload leak check | **PASS** — none in UI, logs, docs, chat | **NOT RUN** | |
| M10 | Hard stop or operator stop | Window ended at hard stop time or operator stop; no overrun without separate approval | **NOT RUN** | |

| Field | Value |
|-------|--------|
| Window start (local / UTC) | |
| Window end (local / UTC) | |
| Planned duration | 1–2 hours |
| Window owner | |
| Rollback owner | **Chamnan / Operator** |
| Hard stop (ICT) | **12:30** |
| `resolutionPath` / diagnostic codes (LINE) | Codes only |

---

## Rollback / end-of-window R1–R6

Execute at hard stop, on stop condition, or if operator ends window early.

| # | Step | Expected | Result |
|---|------|----------|--------|
| R1 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** | Flag removed or `false` | **NOT RUN** |
| R2 | Redeploy Railway worker | Redeploy confirmed | **NOT RUN** |
| R3 | Worker healthy | `/ready` OK | **NOT RUN** |
| R4 | LINE recovery smoke (flag-off) | **SENT**; queue **DONE**; `external_message_id` present | **NOT RUN** |
| R5 | Ops Runtime after rollback | No new critical issue | **NOT RUN** |
| R6 | Final flag state confirmed | **OFF / ABSENT** | **NOT RUN** |

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

**READY FOR GO EXTENDED MONITORING — AWAITING EXPLICIT OPERATOR APPROVAL**

- Pre-window P1–P10 **PASS** (P2 **PASS WITH NOTE**: Railway commit SHA not shown in UI).
- Extended monitoring **not executed**. Flag **not enabled** by Agent A.
- Production flag: **OFF / ABSENT** (P4 **PASS**).
- **`DB_ONLY` not used**; **`--execute` not run**; no token/secret changes.
- Hard stop: **12:30 ICT**; rollback owner: **Chamnan / Operator**.
- Operator must say **GO EXTENDED MONITORING** before M1–M10.

### Final decision options (after execution)

| Outcome | When |
|---------|------|
| **PASS — LIMITED EXTENDED MONITORING WINDOW COMPLETED AND ROLLED BACK TO OFF/ABSENT** | M1–M10 PASS; R1–R6 PASS; final flag **OFF/ABSENT** |
| **PASS WITH NOTES** | Window completed and rolled back; minor follow-up (e.g. `resolutionPath` not cited) |
| **ROLLED BACK / HOLD** | Stop condition triggered or rollback smoke failed |
| **Long-running flag-on** | **NOT APPROVED** unless separate future phase approves |

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
| Resolver flag enabled | **No** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **PASS** |
| `npm run build` | **PASS** |
