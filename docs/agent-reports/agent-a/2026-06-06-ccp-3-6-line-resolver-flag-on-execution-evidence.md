# CCP-3.6 — Controlled LINE Resolver Flag-On Window Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Execution evidence — **pre-window baseline only** (stopped before flag-on)
**Master at capture:** `ddaee95` (PR **#181** merged — CCP-3.5 plan)
**Prior evidence:** [CCP-3.4 P1–P7 preflight](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md) · [CCP-3.4-SEC remediation](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md) · [CCP-3.5 flag-on window plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md)

---

## Goal

Prepare and record a controlled production flag-on execution window for the LINE-focused resolver pilot, with **global Railway worker blast-radius monitoring** (LINE + Facebook + Instagram under `DB_WITH_ENV_FALLBACK`).

This artifact captures **pre-window baseline** and execution templates. **Flag-on has not been executed** in this Agent A session.

---

## Guardrails confirmation (this session)

| Guardrail | Status |
|-----------|--------|
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** |
| `DB_ONLY` | **Not used / not proposed** |
| Credential migration `--execute` | **Not run** |
| Channel token/secret changes | **None** |
| Vercel env changes | **None** |
| Migrations / runtime / API / worker / package code | **None** |
| Secrets/tokens/raw payloads/full external IDs in this doc | **None** |
| Marketplace / Shopee / Lazada / TikTok | **Paused** |

**Operator-only actions:** Setting Railway worker env, redeploy, production smokes, rollback.

---

## Blast radius reminder

| Item | Value |
|------|--------|
| Affected service for flag change | **Railway worker only** (Vercel redeploy not required for this flag alone) |
| Flag scope | **Global** on worker — LINE, Facebook, Instagram resolvers when `DB_WITH_ENV_FALLBACK` |
| Production runtime modes (CCP-3.4 P4) | LINE / Facebook / Instagram: **DB_WITH_ENV_FALLBACK** |
| Literal enable rule | Only `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (lowercase `true`) |

---

## Pre-window baseline checklist

Complete **immediately before** flag-on. CCP-3.6 Agent A session: **templates + inherited reference only** — fresh production verification **PENDING OPERATOR**.

| # | Check | CCP-3.4 reference (2026-06-05) | CCP-3.6 fresh verification | Result |
|---|--------|--------------------------------|----------------------------|--------|
| B1 | Latest `master` on **Vercel** | Deploy `3e8ae6d` @ 2026-06-04 | Operator confirm SHA ≥ approved commit: _____ | **PENDING** |
| B2 | Latest `master` on **Railway worker** | Deploy `3e8ae6d` @ 2026-06-04 | Operator confirm SHA ≥ approved commit: _____ | **PENDING** |
| B3 | Railway worker healthy | Indirect PASS via P5 smoke | Operator `/ready` or equivalent: _____ | **PENDING** |
| B4 | Resolver flag **OFF / ABSENT** (Railway) | **ABSENT** (operator report) | Operator re-check names only: _____ | **PENDING** |
| B4b | Resolver flag on Vercel | **ABSENT** (env name list) | Optional re-check: _____ | **PENDING** |
| B5 | No **`DB_ONLY`** in production | **PASS** — not found | Operator re-check mode labels only: _____ | **PENDING** |
| B6 | Runtime modes | LINE / FB / IG: **DB_WITH_ENV_FALLBACK** | Operator confirm unchanged: _____ | **PENDING** |
| B7 | Channel Settings **LINE** READY | **PASS** — READY | Operator re-check UI: _____ | **PENDING** |
| B8 | Channel Settings **Facebook** READY | Not recorded in CCP-3.4 P6 | Operator confirm READY or note: _____ | **PENDING** |
| B9 | Channel Settings **Instagram** READY | Not recorded in CCP-3.4 P6 | Operator confirm READY / N/A / note: _____ | **PENDING** |
| B10 | Ops Runtime clean | Post-P5: no new critical issue; DL **26** unchanged | Operator refresh counts: _____ | **PENDING** |
| B11 | Queue/outbox baseline | See § Ops snapshot below (CCP-3.4) | Operator record current counts: _____ | **PENDING** |
| B12 | Worker logs — no current resolver/auth/provider errors | Not fully verified in CCP-3.4 | Operator log scan (codes only): _____ | **PENDING** |
| B13 | Optional legacy LINE outbound **SENT** (flag-off) | P5 **PASS** @ 2026-06-05 | Operator optional re-smoke: _____ | **OPTIONAL / STALE** |
| B14 | Rollback owner assigned | Required per CCP-3.5 B9 | Operator name + channel: _____ | **PENDING** |

**Pre-window gate:** All **PENDING** rows must become **PASS** before **GO FLAG-ON**. B13 optional but recommended if stale.

---

## Ops snapshot (sanitized)

### CCP-3.4 reference (2026-06-05, post-P5)

| Metric | Value |
|--------|--------|
| Outbound pending | 0 |
| Outbound processing | 0 |
| Outbound stale processing | 0 |
| Outbound dead letter | 26 |
| Outbox dead letter | 0 |

### CCP-3.6 pre-window (operator fill before flag-on)

| Metric | Value | Captured at |
|--------|--------|-------------|
| Outbound pending | | |
| Outbound processing | | |
| Outbound stale processing | | |
| Outbound dead letter | | |
| Outbox dead letter | | |

---

## Stop point — before flag-on

| Item | Status |
|------|--------|
| Agent A enabled resolver flag | **No** |
| Operator said **GO FLAG-ON** | **No** |
| Pre-window baseline complete | **No** — operator verification pending |
| Rollback owner assigned | **PENDING** |

**Do not proceed to flag-on until operator explicitly says: `GO FLAG-ON`**

---

## Pre-window decision: is GO FLAG-ON safe?

| Assessment | Detail |
|------------|--------|
| **GO FLAG-ON safe now?** | **No** — fresh baseline not verified in this session |
| **Inherited readiness** | CCP-3.4 P1–P7 **PASS**, SEC **DONE**, CCP-3.5 plan **PASS** — supportive but **time-stale** for deploy SHA and ops counts |
| **Affected service** | **Railway worker only** |
| **Rollback owner** | **Required** — not assigned in this doc |
| **Recommended next step** | Operator completes B1–B14, assigns rollback owner, then issues **GO FLAG-ON** |

**Current decision:** **HOLD — PRE-WINDOW BASELINE INCOMPLETE**

---

## Execution procedure (operator — not executed)

Execute only after **GO FLAG-ON** and all baseline **PASS**.

### A. Flag enable (Railway worker only)

| Step | Action | Evidence |
|------|--------|----------|
| A1 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` = **`true`** | Timestamp: _____ Operator: _____ |
| A2 | Redeploy / restart **Railway worker** | Startup log `channelConnectResolverEnabled: true`: yes / no |

### B. During-window smoke (LINE primary + global monitoring)

| # | Check | Expected | Result |
|---|--------|----------|--------|
| W1 | Worker healthy after redeploy | `/ready` OK | |
| W2 | One controlled **LINE** outbound test | Customer receives message | |
| W3 | Queue job | **DONE**; `last_error` null | |
| W4 | Message row | `delivery_status` **SENT** | |
| W5 | Provider id | `external_message_id` **present** | |
| W6 | Ops Runtime | No new critical issue vs B10/B11 | |
| W7 | Worker logs | No resolver / auth / provider error; no secret substrings | |
| W8 | Facebook / Instagram monitoring | No regression in logs or Ops (global flag) | |

| Field | Value |
|-------|--------|
| Window start (local / UTC) | |
| Test conversation id | |
| Test message id | |
| Queue job id | |
| `resolutionPath` (LINE, code only) | |
| Smoke result | PASS / FAIL / NOT RUN |

### C. Stop conditions (immediate rollback)

LINE fail · queue not DONE · not SENT · `external_message_id` missing · worker crash/restart loop · resolver error · provider auth/token error · Ops critical issue · Facebook/Instagram regression · secret/token leak.

### D. Rollback (if triggered or end of window)

| Step | Action | Expected |
|------|--------|----------|
| D1 | Set flag **`false`** or **remove** variable | |
| D2 | Redeploy Railway worker | `channelConnectResolverEnabled: false` |
| D3 | Worker healthy | `/ready` OK |
| D4 | LINE recovery smoke | DONE / SENT / `external_message_id` present |
| D5 | Record evidence | Sanitized metadata only |

| Field | Value |
|-------|--------|
| Rollback executed? | yes / no / N/A |
| Recovery message id | |
| Recovery job id | |
| Rollback smoke | PASS / FAIL / N/A |

### E. Post-smoke flag state (if smoke passes)

**Recommended:** Set flag **OFF** after short test window unless operator explicitly approves limited monitoring.

| Field | Value |
|-------|--------|
| Final flag state | **OFF / ON / ABSENT** (this session: **not changed by Agent A**) |
| Final execution decision | GO / ROLLED BACK / HOLD / NOT EXECUTED |

---

## During-window / rollback results (this session)

| Section | Status |
|---------|--------|
| Flag-on executed | **No** |
| During-window LINE smoke | **Not run** |
| Rollback | **N/A** |
| Final flag state (production) | **Not verified in this session** — CCP-3.4 reference: **ABSENT/OFF** |

---

## Secret leak check

| Check | Result |
|-------|--------|
| This artifact | **PASS** — no tokens, secrets, raw payloads, or full external IDs |
| Agent A session actions | No production env mutation; no flag enable |

---

## Final decision (CCP-3.6 — this session)

**HOLD — PRE-WINDOW BASELINE INCOMPLETE**

- Execution evidence doc and checklists **ready**.
- **Flag-on not executed.** Agent A did **not** enable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`.
- Operator must complete fresh baseline (B1–B14), assign rollback owner, then say **GO FLAG-ON** before steps A–E.

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-3.5 plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md) | Blast radius, rollback, stop conditions |
| [Pilot checklist §3](../../channel-connect-line-outbound-resolver-pilot-checklist.md) | Operator flag-on steps |
| [Evidence pack §4–§5](../../channel-connect-outbound-rollout-evidence-pack.md) | Flag-on pilot rows |

---

## Verification (CCP-3.6 docs-only)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| Resolver flag enabled by Agent A | **No** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **PASS** |
| `npm run build` | **PASS** |
