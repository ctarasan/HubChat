# CCP-3.6 — Controlled LINE Resolver Flag-On Window Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Controlled flag-on window **executed and rolled back** — final flag **OFF / ABSENT**
**Master at capture:** `ddaee95` (PR **#181** merged — CCP-3.5 plan)
**Operator:** Chamnan / Operator — sanitized reports to Agent A; no secrets in artifact
**Prior evidence:** [CCP-3.4 P1–P7 preflight](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md) · [CCP-3.4-SEC remediation](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md) · [CCP-3.5 flag-on window plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md)

---

## Goal

Prepare and record a controlled production flag-on execution window for the LINE-focused resolver pilot, with **global Railway worker blast-radius monitoring** (LINE + Facebook + Instagram under `DB_WITH_ENV_FALLBACK`).

This artifact records a **short controlled production window**: pre-window baseline (B1–B14 **PASS**), flag-on smoke (W1–W7 **PASS**), rollback to safe state (RB1–RB5 **PASS**). **Final production state:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT**. Long-running flag-on is **not approved**.

---

## Guardrails confirmation

| Guardrail | Status |
|-----------|--------|
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** (operator executed window) |
| Short controlled window only; long-running flag-on | **Not approved** |
| Final flag state after window | **OFF / ABSENT** |
| `DB_ONLY` | **Not used** |
| Credential migration `--execute` | **Not run** |
| Channel token/secret changes | **None** |
| Vercel env changes | **None** |
| Migrations / runtime / API / worker / package code | **None** (docs-only Agent A updates) |
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

## Stop conditions during window

None triggered. Stop conditions monitored: LINE fail · queue not DONE · not SENT · `external_message_id` missing · worker crash · resolver/auth error · Ops critical · Facebook/Instagram regression · secret leak.

---

## Flag-on execution (operator — short controlled window)

**Scope:** Railway worker only. Resolver flag **ON** briefly for LINE smoke + global FB/IG monitoring, then **rolled back OFF/ABSENT**.

### A. Flag enable

| Step | Action | Result |
|------|--------|--------|
| A1 | Operator set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` = **`true`** on Railway worker | **Done** (operator) |
| A2 | Operator redeployed Railway worker | **PASS** (W1) |

### B. During-window smoke (W1–W7)

| # | Check | Result | Sanitized evidence |
|---|--------|--------|-------------------|
| W1 | Railway worker redeployed with resolver flag **ON** | **PASS** | Operator redeploy confirmed |
| W2 | Worker healthy after redeploy | **PASS** | Health confirmed |
| W3 | One controlled **LINE** outbound during flag-on | **PASS** | Message sent; customer delivery confirmed (operator) |
| W4 | Queue + delivery | **PASS** | Queue **DONE**; `metadata_json.delivery_status` **SENT**; `external_message_id` **present** |
| W5 | Ops Runtime | **PASS** | No new critical issue vs baseline |
| W6 | Worker logs | **PASS** | No resolver / auth / provider errors; no secret substrings |
| W7 | Facebook / Instagram monitoring (global flag) | **PASS** | No regression observed |

| Field | Value |
|-------|--------|
| Window type | **Short controlled test** — not long-running monitoring |
| Smoke result (LINE) | **PASS** |
| Message / job / conversation ids | Not recorded (sanitized) |
| `resolutionPath` (LINE) | Not cited in operator report |

### C. Rollback / return to safe state (RB1–RB5)

| # | Step | Result | Sanitized evidence |
|---|------|--------|-------------------|
| RB1 | Resolver flag **OFF / ABSENT** | **PASS** | Operator removed or set `false` |
| RB2 | Railway worker redeployed after rollback | **PASS** | Redeploy confirmed |
| RB3 | Worker healthy | **PASS** | Health confirmed |
| RB4 | LINE recovery smoke (flag-off / legacy path) | **PASS** | **SENT** (operator) |
| RB5 | Ops Runtime after rollback | **PASS** | No new critical issue |

| Field | Value |
|-------|--------|
| Rollback executed | **Yes** — planned end-of-window rollback |
| Rollback owner | **Chamnan / Operator** |
| Rollback smoke | **PASS** |

### D. Final flag state

| Field | Value |
|-------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| Long-running flag-on approved | **No** |
| Recommended posture | Keep flag **OFF / ABSENT** until a future separately approved window |

---

## Execution summary (supersedes pre-window hold)

| Section | Status |
|---------|--------|
| Pre-window B1–B14 | **PASS** |
| Flag-on window executed | **Yes** (operator; short controlled window) |
| During-window W1–W7 | **PASS** |
| Rollback RB1–RB5 | **PASS** |
| Final flag state (production) | **OFF / ABSENT** |
| Agent A production env changes | **None** |

---

## Secret leak check

| Check | Result |
|-------|--------|
| This artifact (full window) | **PASS** — no tokens, secrets, raw payloads, or full external IDs |
| Operator execution window | **PASS** — sanitized report only |
| Agent A session | Docs-only updates; no production env mutation |

---

## Final decision (CCP-3.6)

**PASS — CONTROLLED FLAG-ON WINDOW COMPLETED AND ROLLED BACK TO OFF/ABSENT**

- Pre-window B1–B14 **PASS**; during-window W1–W7 **PASS**; rollback RB1–RB5 **PASS**.
- **Short controlled window only** — long-running resolver flag-on is **not approved**.
- Final production flag: **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` OFF / ABSENT**.
- Global blast radius (LINE + Facebook + Instagram) monitored; **no FB/IG regression** reported.
- **`DB_ONLY` not used**; credential **`--execute` not run**; no token/secret changes.

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
