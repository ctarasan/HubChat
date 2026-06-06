# CCP-4.0 — Controlled DB_ONLY Rehearsal Plan

**Agent:** A
**Date:** 2026-06-06
**Phase:** Planning-only — **`DB_ONLY` not enabled**
**Master at plan:** `9de1643` (PR **#185** CCP-3.9 merged)
**Operator context:** Chamnan / Operator — rollback owner; no secrets in artifact

**Primary artifact:** [`docs/channel-connect-db-only-rehearsal-plan.md`](../../channel-connect-db-only-rehearsal-plan.md)

**Prior:** [CCP-3.9 assessment](./2026-06-06-ccp-3-9-db-only-readiness-assessment.md) · [CCP-3.8 execution](./2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md)

---

## Goal

Create a **controlled `DB_ONLY` rehearsal plan** for a future operator window — **not** to enable `DB_ONLY` or change production config.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Preconditions P1–P15 | Enabling **`DB_ONLY`** |
| Phase 1 LINE-only rehearsal scope | Long-running **`DB_ONLY`** |
| Operator action plan (future CCP-4.1) | Credential migration **`--execute`** |
| Read-only SQL smoke queries | Product / worker / API changes |
| Monitoring, rollback, GO/NO-GO gates | Production env changes |
| CCP-4.1 evidence template | Resolver flag enablement (this phase) |

---

## Guardrails (CCP-4.0 Agent A session)

| Guardrail | Status |
|-----------|--------|
| **`DB_ONLY` enabled** | **No** |
| **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` enabled** | **No** — **OFF / ABSENT** |
| Production config changed | **No** |
| **`--execute`** | **Not run / prohibited** |
| Runtime / API / worker edits | **None** |
| CCP-4.0 approves execution | **No** |

---

## Plan summary

| Section | Content |
|---------|---------|
| **Purpose** | Rehearse `DB_ONLY` safely before any long-running decision; planning only |
| **Current safe state** | **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** |
| **Preconditions** | P1–P15 including **`GO CONTROLLED DB_ONLY REHEARSAL`** |
| **Scope** | **Phase 1: LINE-only `DB_ONLY`**; FB/IG remain **`DB_WITH_ENV_FALLBACK`**; do not claim CCP-3.8 proved FB/IG |
| **Operator actions** | Future CCP-4.1 steps D1–D13 (plan template) |
| **SQL** | Read-only queries for messages, queue_jobs, outbox_events |
| **Monitoring** | Worker/Vercel/Ops Runtime; **SENT** / **DONE** / no leak |
| **Rollback** | R1–R7 → **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT** |
| **GO / NO-GO** | Defined in primary artifact §9 |
| **CCP-4.1 template** | P / D / M / R evidence sections |
| **Recommendation** | **Do not execute** from CCP-4.0; next **CCP-4.1** after operator review |

Detail: [`channel-connect-db-only-rehearsal-plan.md`](../../channel-connect-db-only-rehearsal-plan.md)

---

## Risk / guardrail summary

| Risk | Mitigation in plan |
|------|-------------------|
| **`DB_ONLY` removes env fallback** | LINE-only Phase 1; mandatory rollback R1–R7 |
| FB/IG not proven under `DB_ONLY` | Exclude from Phase 1 active smokes unless separately approved |
| Global blast radius if per-channel scoping fails | Document stronger approval + mandatory FB/IG smokes |
| Historical dead-letter baseline | P9 baseline capture; STOP on unexpected growth |
| Execution without GO | Requires **`GO CONTROLLED DB_ONLY REHEARSAL`** |
| Long-running `DB_ONLY` | **NOT APPROVED** |

---

## Final decision (CCP-4.0)

**PLAN COMPLETE — EXECUTION NOT APPROVED**

- CCP-4.0 is **planning-only**; **`DB_ONLY` not enabled**.
- Production remains **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT**.
- **`--execute` prohibited**; long-running flag-on and long-running **`DB_ONLY` NOT APPROVED**.
- **Next step:** operator review → **CCP-4.1 Controlled DB_ONLY Rehearsal Execution** (only after explicit **GO**).

---

## Verification (CCP-4.0 docs-only)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| **`DB_ONLY` enabled** | **No** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |

---

## Related docs

| Document | Use |
|----------|-----|
| [DB_ONLY rehearsal plan](../../channel-connect-db-only-rehearsal-plan.md) | Primary plan artifact |
| [DB_ONLY readiness assessment](../../channel-connect-db-only-readiness-assessment.md) | CCP-3.9 verdict |
| [Outbound rollout readiness](../../channel-connect-outbound-rollout-readiness.md) | Env inventory |
