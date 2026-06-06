# CCP-3.7 — LINE Resolver Extended Monitoring / Long-Running Flag-On Decision

**Agent:** A
**Date:** 2026-06-06
**Master at planning:** `fb1c9e4` (PR **#182** merged — CCP-3.6 execution evidence)
**Phase:** Planning / decision support only — **no production env changes**

**Prior evidence:** [CCP-3.4 P1–P7](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md) · [CCP-3.4-SEC](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md) · [CCP-3.5 plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md) · [CCP-3.6 execution](./2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md)

---

## Goal

Define the **next-step decision and monitoring plan** after the successful CCP-3.6 short controlled flag-on window. Evaluate whether to remain flag-off, repeat a short window, or schedule **limited extended monitoring** — without approving **long-running** resolver flag-on in this phase.

**This document does not enable** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`, **does not** change production env, and **does not** authorize **DB_ONLY** or credential **`--execute`**.

---

## Current production state (sanitized)

| Item | State |
|------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (post-CCP-3.6 rollback) |
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** |
| `DB_ONLY` | **Not in use** — remains prohibited |
| Affected env surface for flag change | **Railway worker only** |
| Channel Settings (LINE / FB / IG) | **READY** at CCP-3.6 baseline |
| Credential migration `--execute` | **Not run** |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` rotation | **PLANNED ONLY** (SEC remediation) |
| Marketplace channels | **Paused** |

---

## Evidence summary (CCP-3.4 → CCP-3.6)

### CCP-3.4 — Production preflight + SEC

| Phase | Sanitized finding |
|-------|-------------------|
| P1–P7 | **PASS** — deploy healthy; resolver flag **ABSENT**; no **DB_ONLY**; legacy LINE **SENT**; Ops clean |
| SEC R1–R8 | **DONE** / **PASS** — credentials rotated where applicable; flag remained **OFF** |
| Encryption key | **PLANNED ONLY** — not rotated in SEC window |
| Blast radius note | Production modes already **DB_WITH_ENV_FALLBACK** for all three providers |

### CCP-3.5 — Controlled flag-on window plan

| Item | Sanitized finding |
|------|-------------------|
| Deliverable | Docs-only plan: baseline, env change, smoke, rollback, stop conditions |
| Blast radius | **Global** Railway worker flag → LINE + Facebook + Instagram |
| Decision | **READY FOR SCHEDULED CONTROLLED FLAG-ON WINDOW** (planning only at merge) |

### CCP-3.6 — Short controlled execution

| Item | Sanitized finding |
|------|-------------------|
| Pre-window | B1–B14 **PASS**; rollback owner **Chamnan / Operator** |
| Execution | W1–W7 **PASS** — flag **ON** briefly; LINE smoke **SENT**; FB/IG no regression |
| Rollback | RB1–RB5 **PASS** — flag returned **OFF / ABSENT**; recovery smoke **SENT** |
| Final decision | **PASS — WINDOW COMPLETED AND ROLLED BACK TO OFF/ABSENT** |
| Gaps | `resolutionPath` / `configSource` not cited; single short window only |

---

## Global blast-radius reminder

| Item | Detail |
|------|--------|
| Flag location | **Railway worker only** |
| Flag scope | **One switch** → LINE, Facebook, Instagram outbound resolvers when **`DB_WITH_ENV_FALLBACK`** |
| Literal enable | Only `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (lowercase `true`) |
| Pilot intent | LINE-first validation |
| Operational requirement | **Monitor Facebook and Instagram** whenever flag is ON — not LINE-only |

---

## Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Global flag affects FB/IG outbound resolution path | **High** | FB/IG monitoring each window; immediate rollback on regression |
| Short window may not expose delayed failures | **Medium** | Limited extended monitoring (1–2 h) before any long-running discussion |
| `resolutionPath` not captured in CCP-3.6 | **Low–Medium** | Capture diagnostic codes in next window; still not a blocker to **limited** extended plan |
| Encryption key not rotated | **Medium** (future DB-only path) | Keep **DB_ONLY** prohibited; **DB_WITH_ENV_FALLBACK** + legacy ENV remains |
| Operator capacity / high traffic | **Medium** | Option A (stay OFF) or Option B (repeat short window) if monitoring bandwidth low |
| Secret leak in logs/docs/chat | **High** | Sanitized evidence only; rollback + SEC procedure on leak |
| Long-running flag without alerting | **High** | **Long-running flag-on NOT APPROVED** in CCP-3.7 |

---

## Recommended next options

### Option A — Keep OFF / ABSENT

| | |
|--|--|
| **Description** | No resolver flag change; continue legacy + `DB_WITH_ENV_FALLBACK` without CCP-1 DB reads |
| **Pros** | Safest; zero blast-radius exposure |
| **Cons** | No production resolver-path confidence building |
| **When to choose** | High traffic, low monitoring capacity, or need more evidence review |

### Option B — Schedule second short controlled window

| | |
|--|--|
| **Description** | Repeat CCP-3.6 discipline: B1–B14 → **GO FLAG-ON** → W1–W7 → RB1–RB5 → **OFF/ABSENT** |
| **Pros** | Low risk; builds repeatability; can capture `resolutionPath` |
| **Cons** | Still brief; may not observe slow-burn issues |
| **When to choose** | Want more confidence before any extended monitoring |

### Option C — Schedule limited extended monitoring window *(candidate)*

| | |
|--|--|
| **Description** | Flag **ON** for **1–2 hours** max on Railway worker; LINE sample smokes + continuous FB/IG monitoring; **mandatory rollback to OFF/ABSENT** at window end |
| **Pros** | Observes real traffic patterns; still bounded |
| **Cons** | Higher ops load; global blast radius for full duration |
| **When to choose** | CCP-3.6 PASS + operator capacity + rollback owner available |

### Option D — Long-running flag-on

| | |
|--|--|
| **Description** | Leave flag **ON** indefinitely or until cutover complete |
| **Pros** | Continuous resolver path in production |
| **Cons** | Requires alerting, on-call, business sign-off, stronger evidence |
| **CCP-3.7 stance** | **NOT APPROVED** — needs stronger monitoring, alerting, and business approval |
| **DB_ONLY** | **NOT APPROVED** — out of scope |

---

## Extended monitoring candidate plan (Option C template)

Execute **only** after separate operator approval (**GO EXTENDED MONITORING** or equivalent). **Not authorized by this doc.**

| Field | Planned value |
|-------|----------------|
| **Duration** | **1–2 hours** (hard stop) |
| **Window owner** | Operator (e.g. Chamnan / Operator) |
| **Rollback owner** | Same or designated standby (required) |
| **Env change surface** | **Railway worker only** |
| **Flag value during window** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` |
| **Final flag state requirement** | **OFF / ABSENT** unless **separate** long-running approval (not in CCP-3.7) |
| **Channels observed** | **LINE** (primary smokes) · **Facebook** · **Instagram** (no-regression monitoring) |

### Pre-window checklist (before extended window)

| # | Check | Pass criteria |
|---|--------|---------------|
| P1 | Latest `master` on Vercel + Railway worker | Deploy **Ready** / active |
| P2 | Worker healthy | `/ready` or equivalent **healthy** |
| P3 | Resolver flag **OFF / ABSENT** | Confirmed before enable |
| P4 | No **`DB_ONLY`** | Mode labels only — all **DB_WITH_ENV_FALLBACK** |
| P5 | Channel Settings LINE / FB / IG | **READY** |
| P6 | Ops Runtime baseline | Record sanitized queue/outbox counts |
| P7 | Worker logs baseline | No current resolver/auth/provider errors |
| P8 | CCP-3.6 final state | Prior window **PASS** and rolled back |
| P9 | Rollback owner assigned | Named operator on standby |
| P10 | Comms / hard stop time | Window end time documented |

### During-window monitoring checklist

| # | Check | Frequency | Pass criteria |
|---|--------|-----------|---------------|
| M1 | Railway worker healthy | Start + every 15 min | No crash / restart loop |
| M2 | Startup log | Once after enable | `channelConnectResolverEnabled: true` |
| M3 | **LINE** outbound sample | Start + mid-window + pre-rollback | Queue **DONE**; `metadata_json.delivery_status` **SENT**; `external_message_id` **present** |
| M4 | Ops Runtime | Every 15–30 min | No new **critical** issue vs baseline |
| M5 | Queue / outbox health | Every 15–30 min | No spike in pending / stale / dead letter |
| M6 | Worker logs | Continuous review | No resolver / auth / provider error; no secret substrings |
| M7 | **Facebook** monitoring | Continuous | No new outbound errors attributable to window |
| M8 | **Instagram** monitoring | Continuous | No new outbound errors attributable to window |
| M9 | `resolutionPath` / diagnostics (LINE) | Per smoke | Record **codes only** (e.g. `channel_connect_db`, `legacy_fallback`) |
| M10 | Secret leak check | Continuous | **PASS** — no tokens in UI/logs/docs/chat |

### Rollback checklist (end of window or on stop)

| # | Step | Expected |
|---|------|----------|
| R1 | Set flag **`false`** or **remove** on Railway worker | **OFF / ABSENT** |
| R2 | Redeploy Railway worker | Startup `channelConnectResolverEnabled: false` |
| R3 | Worker healthy | `/ready` OK |
| R4 | LINE recovery smoke (flag-off) | **DONE** / **SENT** / `external_message_id` present |
| R5 | Ops Runtime post-rollback | No new critical issue |
| R6 | Record sanitized evidence | Metadata only — no secrets |

### Success criteria (extended window)

| Criterion | Required |
|-----------|----------|
| All pre-window checks **PASS** | Yes |
| Window completed within approved duration | Yes |
| LINE sample smokes **PASS** | Yes |
| FB/IG **no regression** | Yes |
| No stop conditions triggered | Yes |
| Final flag state **OFF / ABSENT** | **Yes — mandatory** |
| Sanitized evidence captured | Yes |

### Stop conditions (immediate rollback)

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
| Any uncertainty about rollback path or owner availability | **Hold / rollback** — do not continue |

### Evidence capture format (sanitized)

| Field | Record |
|-------|--------|
| Window start / end (local + UTC) | Timestamps only |
| Operator + rollback owner | Names only |
| Pre-window Ops counts | Counts only — no payloads |
| LINE smoke results | PASS/FAIL; delivery status labels; **no** message/job/conversation ids unless operator policy allows UUIDs without payloads |
| `resolutionPath` / diagnostic codes | Codes only |
| FB/IG impact | none / issue summary (no raw logs with secrets) |
| Final flag state | **OFF / ABSENT** |
| Window decision | PASS / ROLLED BACK / HOLD |

Attach rows to [`docs/channel-connect-outbound-rollout-evidence-pack.md`](../../channel-connect-outbound-rollout-evidence-pack.md) §4–§5 when executed.

---

## Decision matrix

| Option | Risk | Evidence need | Ops load | CCP-3.7 recommendation |
|--------|------|---------------|----------|------------------------|
| **A** Keep OFF | Lowest | Met | Lowest | Valid default if capacity constrained |
| **B** Second short window | Low | Partial | Low | Valid if repeatability proof desired |
| **C** Limited extended (1–2 h) | Medium | Met by CCP-3.6 | Medium | **Preferred next step** when operator approves |
| **D** Long-running ON | High | Insufficient today | High | **NOT APPROVED** |

---

## Final recommendation (CCP-3.7 — planning only)

**READY TO SCHEDULE LIMITED EXTENDED MONITORING WINDOW**

Rationale:

- CCP-3.4 preflight + SEC **PASS**; CCP-3.5 plan **complete**; CCP-3.6 short window **PASS** with rollback to **OFF/ABSENT**.
- Global blast radius is **understood** and was monitored without FB/IG regression in CCP-3.6.
- A **bounded 1–2 hour** window (Option C) is the appropriate next increment before any long-running discussion.

**Explicit prohibitions in this phase:**

| Item | Status |
|------|--------|
| Long-running flag-on | **NOT APPROVED** |
| `DB_ONLY` | **NOT APPROVED** |
| Credential `--execute` | **NOT APPROVED** |
| Agent A / this doc enables resolver flag | **No** |
| Production env changes in CCP-3.7 | **None** |

**Default posture until scheduled window:** keep `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT**.

---

## Guardrails confirmation (CCP-3.7 Agent A session)

| Guardrail | Status |
|-----------|--------|
| Resolver flag enabled | **No** |
| Production env changes | **None** |
| `DB_ONLY` | **Not used / not proposed** |
| `--execute` | **Not run** |
| Token/secret changes | **None** |
| Runtime / API / worker / migration edits | **None** |
| Secrets in this doc | **None** |

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-3.5 plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md) | Short-window discipline |
| [CCP-3.6 execution](./2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md) | Prior window evidence |
| [Pilot checklist §3](../../channel-connect-line-outbound-resolver-pilot-checklist.md) | Operator steps |
| [Evidence pack](../../channel-connect-outbound-rollout-evidence-pack.md) | §4–§5 templates |

---

## Verification (CCP-3.7 docs-only)

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
