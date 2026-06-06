# CCP-3.6 — Controlled LINE Resolver Flag-On Window Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Pre-window baseline **complete** — **awaiting explicit GO FLAG-ON** (flag-on not executed)
**Master at capture:** `ddaee95` (PR **#181** merged — CCP-3.5 plan)
**Baseline captured by:** Operator (Chamnan) — sanitized report to Agent A; no secrets in artifact
**Prior evidence:** [CCP-3.4 P1–P7 preflight](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md) · [CCP-3.4-SEC remediation](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md) · [CCP-3.5 flag-on window plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md)

---

## Goal

Prepare and record a controlled production flag-on execution window for the LINE-focused resolver pilot, with **global Railway worker blast-radius monitoring** (LINE + Facebook + Instagram under `DB_WITH_ENV_FALLBACK`).

This artifact captures **pre-window baseline** (B1–B14 **PASS**) and execution templates. **Flag-on has not been executed.** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` remains **OFF / ABSENT**.

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

Complete **immediately before** flag-on. **CCP-3.6 operator verification:** all B1–B14 **PASS** (sanitized).

| # | Check | Sanitized evidence (operator) | Result |
|---|--------|-------------------------------|--------|
| B1 | Latest `master` on **Vercel** | Vercel Production **Ready** on `master` | **PASS** |
| B2 | Latest `master` on **Railway worker** | Railway worker **active** on `master` | **PASS** |
| B3 | Railway worker healthy | Worker health confirmed | **PASS** |
| B4 | Resolver flag **OFF / ABSENT** (Railway) | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT** (names only) | **PASS** |
| B5 | No **`DB_ONLY`** in production | Not found in Railway worker variables (mode labels only) | **PASS** |
| B6 | Runtime modes | LINE / Facebook / Instagram: **DB_WITH_ENV_FALLBACK** | **PASS** |
| B7 | Channel Settings **LINE** READY | Dashboard LINE **READY** | **PASS** |
| B8 | Channel Settings **Facebook** READY | Dashboard Facebook **READY** | **PASS** |
| B9 | Channel Settings **Instagram** READY | Dashboard Instagram **READY** | **PASS** |
| B10 | Ops Runtime clean | No new critical issue | **PASS** |
| B11 | Queue/outbox baseline | Recorded in sanitized form (counts not duplicated here) | **PASS** |
| B12 | Worker logs clean | No resolver / auth / provider errors | **PASS** |
| B13 | Legacy LINE outbound **SENT** (flag-off) | Queue **DONE**; `delivery_status` **SENT**; `external_message_id` **present** | **PASS** |
| B14 | Rollback owner assigned | **Chamnan / Operator** | **PASS** |

**Pre-window gate:** B1–B14 all **PASS** → eligible for **GO FLAG-ON** when operator explicitly approves.

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

### CCP-3.6 pre-window (operator — sanitized)

| Metric | Status |
|--------|--------|
| Outbound queue / outbox baseline | **Recorded** (sanitized form per operator; numeric counts not duplicated in this artifact) |
| Ops delta vs prior | **No new critical issue** (B10 **PASS**) |

---

## Stop point — before flag-on

| Item | Status |
|------|--------|
| Agent A enabled resolver flag | **No** |
| Operator said **GO FLAG-ON** | **No** — awaiting explicit approval |
| Pre-window baseline complete | **Yes** — B1–B14 **PASS** |
| Rollback owner assigned | **Yes** — Chamnan / Operator |
| Resolver flag production state | **OFF / ABSENT** (B4 **PASS**) |

**Do not proceed to flag-on until operator explicitly says: `GO FLAG-ON`**

---

## Pre-window decision: is GO FLAG-ON safe?

| Assessment | Detail |
|------------|--------|
| **GO FLAG-ON safe now?** | **Yes** — baseline B1–B14 **PASS**; awaiting explicit operator command only |
| **Prior readiness** | CCP-3.4 P1–P7 **PASS**, SEC **DONE**, CCP-3.5 plan **PASS** |
| **Affected service** | **Railway worker only** |
| **Rollback owner** | **Chamnan / Operator** |
| **Recommended next step** | Operator issues **GO FLAG-ON** → execute steps A–E |

**Current decision:** **READY FOR GO FLAG-ON — AWAITING EXPLICIT OPERATOR APPROVAL**

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
| Final flag state (production) | **OFF / ABSENT** (B4 **PASS** — not changed by Agent A) |

---

## Secret leak check

| Check | Result |
|-------|--------|
| This artifact | **PASS** — no tokens, secrets, raw payloads, or full external IDs |
| Agent A session actions | No production env mutation; no flag enable |

---

## Final decision (CCP-3.6)

**READY FOR GO FLAG-ON — AWAITING EXPLICIT OPERATOR APPROVAL**

- Pre-window baseline B1–B14 **PASS** (operator sanitized report).
- **Flag-on not executed.** Agent A did **not** enable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`.
- Production flag state: **OFF / ABSENT**.
- Operator must say **GO FLAG-ON** before steps A–E.

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
