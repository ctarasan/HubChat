# CCP-4.1 — Controlled DB_ONLY Rehearsal Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Controlled LINE **`DB_ONLY` rehearsal COMPLETE** — rolled back to **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT**
**Result:** **PASS WITH NOTES**
**PR:** [#187](https://github.com/ctarasan/HubChat/pull/187)
**Master at capture:** `370527f` (PR **#186** CCP-4.0 plan merged)
**Operator:** Chamnan / Operator — sanitized report to Agent A; no secrets in artifact
**Plan:** [CCP-4.0 rehearsal plan](../../channel-connect-db-only-rehearsal-plan.md) · [CCP-3.9 assessment](../../channel-connect-db-only-readiness-assessment.md)
**Prior evidence:** [CCP-3.8 execution](./2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md) · [CCP-3.6 execution](./2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md)

---

## Goal

Prepare execution evidence for a **controlled `DB_ONLY` rehearsal** (Phase 1: LINE-only preferred). Record preflight, window actions, monitoring, rollback, and final decision — **without** enabling `DB_ONLY` or the resolver flag until operator explicitly says **`GO CONTROLLED DB_ONLY REHEARSAL`**.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Preflight P1–P17 | Long-running **`DB_ONLY`** |
| DB_ONLY window D1–D8 (after GO) | Credential migration **`--execute`** |
| Monitoring M1–M10 (after GO) | Token/secret changes |
| Rollback R1–R7 (after GO) | Product / worker / API / migration edits |
| Sanitized evidence capture | Vercel env change (not expected) |
| Phase 1 LINE-only rehearsal | Marketplace channels |

**Final required state after any window:** **`DB_WITH_ENV_FALLBACK`** per provider; resolver flag **OFF / ABSENT**.

---

## Guardrails

| Guardrail | Status (CCP-4.1) |
|-----------|------------------|
| Agent A enabled **`DB_ONLY`** | **No** — operator only during approved window |
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** — operator only if required; **rolled back OFF / ABSENT** |
| Operator said **GO CONTROLLED DB_ONLY REHEARSAL** | **Yes** — controlled LINE rehearsal executed |
| Scope | **LINE-only `DB_ONLY`** — Facebook/Instagram **`DB_ONLY` NOT APPROVED** |
| Production env changes | **Operator only** (window + rollback); final state safe |
| `DB_ONLY` left running | **No** — rolled back |
| `--execute` | **Not run / prohibited** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Long-running resolver flag-on | **NOT APPROVED** |
| Product / runtime code changes | **None** |
| Secrets/tokens/raw payloads in this doc | **None** (partial row/job IDs only) |

---

## Current production state (post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (R1 **PASS**) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` / `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (unchanged in Phase 1 scope) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (R2 **PASS**) |
| `DB_ONLY` on any provider | **Not running** — rolled back (R7 **PASS**) |
| CCP-4.1 rehearsal executed | **Yes** — controlled LINE-only; **rolled back** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |

---

## Preflight checklist P1–P17

Complete **immediately before** any `DB_ONLY` enable. **CCP-4.1 Agent A session:** repo-safe items **PASS**; operator live checks **NOT RUN** until pre-window verification.

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `370527f` — `git pull --ff-only` clean |
| P2 | PR **#186** (CCP-4.0) included in `master` | Merge commit on `master` | **PASS** | PR **#186** merged |
| P3 | Current production mode | LINE / Facebook / Instagram: **`DB_WITH_ENV_FALLBACK`** | **PASS** | Documented safe state; Agent A did **not** change modes |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unset or absent from Railway worker | **PASS** | Flag **OFF / ABSENT**; Agent A did **not** enable |
| P5 | **`DB_ONLY` not enabled** | No `HUBCHAT_*_RUNTIME_CONFIG_MODE=DB_ONLY` in production | **PASS** | **`DB_ONLY` not enabled** |
| P6 | **`--execute` not used** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P7 | Railway worker healthy | `/ready` OK; no restart loop | **NOT RUN** | Awaiting operator pre-window verify |
| P8 | Vercel app/API healthy | Production **Ready**; API smoke acceptable | **NOT RUN** | Awaiting operator pre-window verify |
| P9 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter recorded from `/dashboard/ops` | **NOT RUN** | Awaiting operator baseline capture |
| P10 | Historical dead-letter baseline documented | Known baselines recorded (verify current vs CCP-3.8: inbound DL ≈ 6, outbound queue DL ≈ 26) | **NOT RUN** | Awaiting operator baseline capture |
| P11 | Channel Settings — LINE **Test connection READY** | LINE **READY** for Phase 1 scope | **NOT RUN** | Awaiting operator verify |
| P12 | Channel Settings — Facebook / Instagram | **READY** or explicitly **excluded from Phase 1** active smokes (monitor only) | **NOT RUN** | Phase 1 default: FB/IG **not actively rehearsed**; CCP-3.8 did **not** prove FB/IG under traffic |
| P13 | LINE DB credentials present | CCP vault metadata ready for LINE **`DB_ONLY`** rehearsal | **NOT RUN** | Awaiting operator verify (fingerprints/metadata only) |
| P14 | Rollback owner assigned | Owner available for window + rollback | **PASS** | **Chamnan / Operator** |
| P15 | Hard stop time defined | Time-boxed stop documented before execution | **NOT RUN** | Define before **GO** (e.g. 1–2 h ICT stop) |
| P16 | Blast radius reviewed | LINE-only preferred; global blast radius requires stronger approval | **PASS** | Per [CCP-4.0 plan §4](../../channel-connect-db-only-rehearsal-plan.md#4-proposed-rehearsal-scope): Phase 1 LINE-only; FB/IG remain **`DB_WITH_ENV_FALLBACK`** |
| P17 | Decision before execution | **GO CONTROLLED DB_ONLY REHEARSAL** received | **PASS** | Operator approved controlled LINE rehearsal |

**Preflight gate for execution:** P1–P16 operator-applicable items **PASS** + operator **`GO CONTROLLED DB_ONLY REHEARSAL`** → may begin D1–D8.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.0 plan reviewed | **Yes** — PR **#186** merged |
| Agent A repo preflight P1–P6, P14, P16 | **PASS** |
| Operator live preflight P7–P13, P15 | **Not captured in this artifact** |
| Operator command **GO CONTROLLED DB_ONLY REHEARSAL** | **Received** |
| Scope | **Controlled LINE `DB_ONLY` rehearsal only** — FB/IG **`DB_ONLY` NOT APPROVED** |
| Rehearsal executed | **Yes** — rolled back |
| Rollback owner | **Chamnan / Operator** |

---

## GO approval

| Item | Status |
|------|--------|
| Operator phrase | **`GO CONTROLLED DB_ONLY REHEARSAL`** — **approved** |
| Scope | **Controlled LINE `DB_ONLY` rehearsal** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — not actively rehearsed |
| **`--execute`** | **Prohibited** — not used |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Rollback owner | **Chamnan / Operator** |

---

## DB_ONLY window actions D1–D4

Executed after **GO CONTROLLED DB_ONLY REHEARSAL**. Operator-run; sanitized evidence recorded by Agent A.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| D1 | Set LINE **`DB_ONLY`** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY`; FB/IG unchanged | **PASS** | LINE **`DB_ONLY`** env set for controlled rehearsal |
| D2 | Set resolver flag if required | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` only if architecture requires | **NOT REQUIRED (not cited)** | Operator report did not separately record resolver flag enable; LINE **`DB_ONLY`** smoke **SENT** (M1); final flag **OFF / ABSENT** (R2) |
| D3 | Railway worker redeployed | Redeploy confirmed | **PASS** | Worker redeploy after env change confirmed |
| D4 | Worker healthy after redeploy | `/ready` OK | **PASS** | Health confirmed after redeploy |

| Field | Value |
|-------|--------|
| LINE smoke (UTC) | `2026-06-06 09:03:36+00` |
| Rollback recovery smoke (UTC) | `2026-06-06 09:08:55+00` |
| Phase 1 scope | LINE **`DB_ONLY`** only; FB/IG **`DB_WITH_ENV_FALLBACK`** |

---

## Operator window evidence (sanitized)

| Capture | Evidence |
|---------|----------|
| **GO** | **`GO CONTROLLED DB_ONLY REHEARSAL`** approved; LINE-only scope |
| LINE **`DB_ONLY` env (during window) | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY` (D1 **PASS**) |
| Railway worker redeploy | **PASS** (D3) |
| Worker healthy after redeploy | **PASS** (D4) |
| **LINE** message row (during window) | `61af95ef`; **OUTBOUND**; `channel_type` **LINE**; `created_at` `2026-06-06 09:03:36+00`; `external_message_id_present` = true; `delivery_status` = **SENT** |
| Queue job (during window) | `875931d0`; `message.outbound.requested`; `created_at` `2026-06-06 09:03:36+00`; **DONE**; `last_error_empty` = true |
| Ops Runtime during window | **NOT CAPTURED** in operator report (M3) |
| Railway worker logs | **NOT CAPTURED** in operator report (M4) |
| Vercel logs | **NOT CAPTURED** in operator report (M5) |
| Secret / token leak check | **NOT CAPTURED** in operator report (M6) |
| **Facebook** monitoring | **PASS WITH NOTE** — no FB **`DB_ONLY`** rehearsal; no active FB traffic tested (M7) |
| **Instagram** monitoring | **PASS WITH NOTE** — no IG **`DB_ONLY`** rehearsal; no active IG traffic tested (M8) |
| Rollback: LINE → **`DB_WITH_ENV_FALLBACK`** | Operator restored `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` (R1) |
| Rollback: resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** (R2) |
| Rollback: worker redeploy + healthy | **PASS** (R3, R4) |
| Post-rollback LINE recovery | `ffcdac3`; **OUTBOUND**; `created_at` `2026-06-06 09:08:55+00`; `external_message_id_present` = true; `delivery_status` = **SENT**; job `415b669f` **DONE**; `last_error_empty` = true (R5, R6) |
| Final state | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK`; resolver flag **OFF / ABSENT** (R7) |

---

## Monitoring checks M1–M8

During controlled LINE **`DB_ONLY`** window. Operator-run; sanitized evidence recorded by Agent A.

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | **LINE `DB_ONLY` outbound smoke** | **OUTBOUND**; `external_message_id` present; `delivery_status` **SENT** | **PASS** | Message `61af95ef`; `created_at` `2026-06-06 09:03:36+00`; `channel_type` **LINE**; `external_message_id_present` = true; `delivery_status` = **SENT** |
| M2 | Queue job terminal | `message.outbound.requested` **DONE**; `last_error` empty | **PASS** | Job `875931d0`; `created_at` `2026-06-06 09:03:36+00`; **DONE**; `last_error_empty` = true |
| M3 | Ops Runtime clean | No new stale **PROCESSING**; no unexpected dead-letter growth | **NOT CAPTURED** | Operator report did not include Ops Runtime snapshot |
| M4 | Railway worker logs clean | No resolver / auth / provider errors; no leak | **NOT CAPTURED** | Operator report did not include log review artifact |
| M5 | Vercel logs clean | No critical API/auth errors tied to smokes | **NOT CAPTURED** | Operator report did not include Vercel log review artifact |
| M6 | No secret / token / raw payload leak | None in UI, logs, docs, chat | **NOT CAPTURED** | Operator report did not include explicit leak scan artifact |
| M7 | **Facebook** monitoring | No unexpected regression **or excluded** | **PASS WITH NOTE** | **No Facebook `DB_ONLY` rehearsal**; no active FB traffic tested — do **not** infer FB **`DB_ONLY`** proof |
| M8 | **Instagram** monitoring | No unexpected regression **or excluded** | **PASS WITH NOTE** | **No Instagram `DB_ONLY` rehearsal**; no active IG traffic tested — do **not** infer IG **`DB_ONLY`** proof |

---

## Rollback checks R1–R7

Execute at hard stop, on STOP condition, or if operator ends window early.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Restore LINE runtime mode | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | Operator restored **`DB_WITH_ENV_FALLBACK`** |
| R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |
| R3 | Redeploy Railway worker | Redeploy confirmed | **PASS** | Worker redeploy after rollback confirmed |
| R4 | Worker healthy | `/ready` OK | **PASS** | Health confirmed after rollback redeploy |
| R5 | Post-rollback LINE recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `ffcdac3`; **OUTBOUND**; `channel_type` **LINE**; `created_at` `2026-06-06 09:08:55+00`; `external_message_id_present` = true; `delivery_status` = **SENT** |
| R6 | Post-rollback queue job | **DONE**; `last_error` empty | **PASS** | Job `415b669f`; `created_at` `2026-06-06 09:08:55+00`; **DONE**; `last_error_empty` = true |
| R7 | Final config state confirmed | **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** | **PASS** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK`; `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |

---

## Stop conditions (immediate rollback)

| Condition | Action |
|-----------|--------|
| LINE smoke fails | Rollback R1–R7 |
| Queue not **DONE** | Rollback |
| `last_error` non-empty on success path | Rollback |
| `delivery_status` not **SENT** | Rollback |
| Unexpected **`ENV_FALLBACK`** under planned LINE **`DB_ONLY`** | Rollback + investigate |
| Worker crash / restart loop | Rollback |
| Ops Runtime regression | Rollback |
| Facebook / Instagram unexpected errors attributable to window | Rollback |
| Secret / token / raw payload leak | Rollback + SEC incident |
| Window exceeds hard stop without separate approval | Rollback |

---

## Final decision (CCP-4.1)

**PASS WITH NOTES — CONTROLLED LINE `DB_ONLY` REHEARSAL COMPLETE**

| Item | State |
|------|--------|
| CCP-4.1 controlled rehearsal | **COMPLETE** |
| Result | **PASS WITH NOTES** |
| LINE **`DB_ONLY` controlled smoke | **PASS** — **SENT** / queue **DONE** |
| Rollback | **PASS** — R1–R7 |
| Final production state | **`DB_WITH_ENV_FALLBACK`** + resolver flag **OFF / ABSENT** |
| `DB_ONLY` left running | **No** |
| **`--execute`** | **Not used / prohibited** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — not actively proven by this rehearsal |
| Product / runtime code changes | **None** |
| Rollback owner | **Chamnan / Operator** |

**Notes (PASS WITH NOTES rationale):**

- M3–M6: Ops Runtime, Railway logs, Vercel logs, and explicit leak scan **NOT CAPTURED** in operator report — do not infer beyond recorded evidence.
- M7 / M8: **PASS WITH NOTE** — no Facebook or Instagram **`DB_ONLY`** rehearsal; no active FB/IG traffic tested.
- D2: Resolver flag enable step **not separately cited**; final flag **OFF / ABSENT** confirmed.
- **Controlled LINE-only rehearsal success does not approve long-running production `DB_ONLY` or broad rollout.**

**Not approved / not recommended:**

- Long-running **`DB_ONLY`** — **NOT APPROVED**
- Facebook / Instagram **`DB_ONLY`** — **NOT APPROVED**; not proven by this rehearsal
- Broad **`DB_ONLY` rollout** — **not recommended** from CCP-4.1 alone; further assessment required

### Final production state (confirmed post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` | **Not running** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-4.0 rehearsal plan](../../channel-connect-db-only-rehearsal-plan.md) | Operator actions, SQL, rollback |
| [CCP-3.9 assessment](../../channel-connect-db-only-readiness-assessment.md) | Readiness verdict |
| [CCP-3.8 execution](./2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md) | Prior window evidence (not FB/IG traffic proof) |
| [Worker queue observability](../../hubchat-worker-queue-observability-runbook.md) | Ops Runtime baselines |

---

## Verification (CCP-4.1 docs-only)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| **`DB_ONLY` enabled (final state)** | **No** — rolled back |
| Resolver flag (final state) | **OFF / ABSENT** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |
