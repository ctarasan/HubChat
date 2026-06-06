# CCP-4.1 — Controlled DB_ONLY Rehearsal Execution Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Preflight **complete** — **HOLD — AWAITING GO CONTROLLED DB_ONLY REHEARSAL** (rehearsal not executed)
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

| Guardrail | Status (CCP-4.1 Agent A session) |
|-----------|----------------------------------|
| Agent A enabled **`DB_ONLY`** | **No** |
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** |
| Operator said **GO CONTROLLED DB_ONLY REHEARSAL** | **No** |
| Production env changes | **None** |
| `DB_ONLY` | **Not enabled / prohibited** |
| `--execute` | **Not run / prohibited** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Long-running resolver flag-on | **NOT APPROVED** |
| Secrets/tokens/raw payloads in this doc | **None** |

---

## Current production state (verified pre-rehearsal)

| Item | State |
|------|--------|
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** (P3 **PASS**) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (P4 **PASS**) |
| `DB_ONLY` on any provider | **Not enabled** (P5 **PASS**) |
| Env change surface | **Railway worker only** (operator, after GO only) |
| CCP-4.1 rehearsal executed | **No** |

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
| P17 | Decision before execution | **HOLD — AWAITING GO CONTROLLED DB_ONLY REHEARSAL** | **HOLD** | Operator **GO** **not received** |

**Preflight gate for execution:** P1–P16 operator-applicable items **PASS** + operator **`GO CONTROLLED DB_ONLY REHEARSAL`** → may begin D1–D8.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.0 plan reviewed | **Yes** — PR **#186** merged |
| Agent A repo preflight P1–P6, P14, P16 | **PASS** |
| Operator live preflight P7–P13, P15 | **NOT RUN** — verify before **GO** |
| Operator command **GO CONTROLLED DB_ONLY REHEARSAL** | **Not received** |
| **`DB_ONLY` enable authorized** | **No** |
| Resolver flag enable authorized | **No** |

**Do not enable `DB_ONLY` or resolver flag until operator explicitly says: `GO CONTROLLED DB_ONLY REHEARSAL`**

---

## DB_ONLY window actions D1–D8

Execute **only** after **GO CONTROLLED DB_ONLY REHEARSAL** and P1–P17 **PASS**. **Not executed in this Agent A session.**

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| D1 | **GO time** captured | Local + UTC recorded | **NOT RUN** | |
| D2 | Pre-window env confirmed | **`DB_WITH_ENV_FALLBACK`**; flag **OFF / ABSENT** | **NOT RUN** | |
| D3 | Set LINE **`DB_ONLY`** (Phase 1) | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY`; FB/IG unchanged | **NOT RUN** | |
| D4 | Set resolver flag if required | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` only if architecture requires | **NOT RUN** | |
| D5 | Railway worker redeployed | Redeploy confirmed | **NOT RUN** | |
| D6 | Worker healthy after redeploy | `/ready` OK | **NOT RUN** | |
| D7 | Controlled LINE outbound smoke | **SENT**; `external_message_id` present; queue **DONE**; `last_error` empty | **NOT RUN** | |
| D8 | Optional FB/IG smoke | N/A unless separately approved | **NOT RUN** | Default **N/A** — monitor only |

| Field | Placeholder |
|-------|-------------|
| GO time (local / UTC) | |
| Exact env changes (names only) | |
| Hard stop (ICT / UTC) | |

---

## Operator window evidence (fill after GO)

**Do not record `DB_ONLY` or resolver flag as enabled until operator runs the window.**

| Capture | Placeholder |
|---------|-------------|
| GO time (local / UTC) | |
| Exact **`DB_ONLY` / resolver env changes** | Variable names + values (no secrets) |
| Railway worker redeploy confirmation | |
| Worker healthy after redeploy | |
| **LINE** message row | **OUTBOUND**; `external_message_id` present; `metadata_json.delivery_status` **SENT** |
| Queue job | `message.outbound.requested` **DONE**; `last_error` empty |
| Ops Runtime during window | Clean vs P9/P10 baseline |
| Railway worker logs | Clean; no secret/token/raw payload leak |
| Vercel logs | Clean |
| **Facebook** monitoring | No regression **or excluded with reason** |
| **Instagram** monitoring | No regression **or excluded with reason** |
| Rollback before hard stop | |
| Post-rollback LINE recovery smoke | **SENT** |
| Final runtime modes | **`DB_WITH_ENV_FALLBACK`** all providers |
| Final resolver flag | **OFF / ABSENT** |

---

## Monitoring checks M1–M10

During window only. **Not executed in this Agent A session.**

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | Worker healthy after redeploy | `/ready` OK; no restart loop | **NOT RUN** | |
| M2 | LINE outbound smoke | `external_message_id` present; `delivery_status` **SENT** | **NOT RUN** | |
| M3 | Queue job terminal | `message.outbound.requested` **DONE**; `last_error` empty | **NOT RUN** | |
| M4 | Ops Runtime clean | No new stale **PROCESSING**; no unexpected dead-letter growth vs P9/P10 | **NOT RUN** | |
| M5 | Railway worker logs clean | No resolver / auth / provider errors; no leak | **NOT RUN** | |
| M6 | Vercel logs clean | No critical API/auth errors tied to smokes | **NOT RUN** | |
| M7 | **Facebook** monitoring | No unexpected regression **or excluded** (Phase 1 default: monitor only) | **NOT RUN** | Do **not** claim CCP-3.8 proved FB |
| M8 | **Instagram** monitoring | No unexpected regression **or excluded** | **NOT RUN** | Do **not** claim CCP-3.8 proved IG |
| M9 | Secret / token / raw payload leak | None in UI, logs, docs, chat | **NOT RUN** | |
| M10 | Hard stop / rollback initiated | Window ended; rollback before or at hard stop | **NOT RUN** | |

---

## Rollback checks R1–R7

Execute at hard stop, on STOP condition, or if operator ends window early.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Revert **`DB_ONLY`** | All providers → **`DB_WITH_ENV_FALLBACK`** | **NOT RUN** | |
| R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **NOT RUN** | |
| R3 | Redeploy Railway worker | Redeploy confirmed | **NOT RUN** | |
| R4 | Worker healthy | `/ready` OK | **NOT RUN** | |
| R5 | Post-rollback LINE recovery smoke | **SENT**; queue **DONE**; `last_error` empty; `external_message_id` present | **NOT RUN** | |
| R6 | Ops Runtime after rollback | No new critical issue vs baseline | **NOT RUN** | |
| R7 | Final config state confirmed | **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** | **NOT RUN** | |

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

**HOLD — AWAITING GO CONTROLLED DB_ONLY REHEARSAL**

- Agent A repo preflight P1–P6, P14, P16 **PASS**; operator live checks P7–P13, P15 **NOT RUN**.
- Controlled **`DB_ONLY` rehearsal not executed**. **`DB_ONLY` not enabled** by Agent A.
- Resolver flag **not enabled** by Agent A — **OFF / ABSENT** (P4 **PASS**).
- Production mode **`DB_WITH_ENV_FALLBACK`** (P3 **PASS**).
- **`--execute` not used** (P6 **PASS**); long-running **`DB_ONLY` NOT APPROVED**.
- Rollback owner: **Chamnan / Operator** (P14 **PASS**).
- Operator must say **GO CONTROLLED DB_ONLY REHEARSAL** before D1–D8; do **not** record execution as completed until evidence is filled.

### Final decision options (after execution)

| Outcome | When |
|---------|------|
| **PASS — CONTROLLED DB_ONLY REHEARSAL COMPLETED AND ROLLED BACK** | D/M **PASS**; R1–R7 **PASS**; final **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT** |
| **PASS WITH NOTES** | Rehearsal completed and rolled back; minor follow-up documented |
| **ROLLED BACK / HOLD** | Stop condition triggered or rollback smoke failed |
| **Long-running `DB_ONLY`** | **NOT APPROVED** unless separate future phase approves |

### Final production state (required after any window)

| Item | Required state |
|------|----------------|
| Runtime modes | **`DB_WITH_ENV_FALLBACK`** (all providers in scope) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
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
| **`DB_ONLY` enabled** | **No** |
| Resolver flag enabled | **No** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |
