# CCP-4.2 — DB_ONLY Rollout Decision

**Agent:** A
**Date:** 2026-06-06
**Phase:** Analysis-only — **`DB_ONLY` not enabled**
**Master at decision:** `d7b48a1` (PR **#187** CCP-4.1 merged)
**Operator context:** Chamnan / Operator — prior CCP-4.1 evidence reviewed; no secrets in artifact

**Primary artifact:** [`docs/channel-connect-db-only-rollout-decision.md`](../../channel-connect-db-only-rollout-decision.md)

**Prior:** [CCP-4.1 execution](./2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md) · [CCP-4.0 plan](../../channel-connect-db-only-rehearsal-plan.md) · [CCP-3.9 assessment](./2026-06-06-ccp-3-9-db-only-readiness-assessment.md)

---

## Goal

Decide the **next safe step** after CCP-4.1 controlled LINE **`DB_ONLY` rehearsal** — **not** to enable **`DB_ONLY`**.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Review CCP-3.8 / CCP-3.9 / CCP-4.0 / CCP-4.1 evidence | Enabling **`DB_ONLY`** |
| Decision matrix (Options A–E) | Enabling resolver flag |
| CCP-4.3 / CCP-4.4 / CCP-4.5 roadmap proposal | Credential migration **`--execute`** |
| Risk assessment | Long-running / production-wide **`DB_ONLY`** |
| Final recommendation | Product / worker / API changes |

---

## Guardrails (CCP-4.2 Agent A session)

| Guardrail | Status |
|-----------|--------|
| **`DB_ONLY` enabled** | **No** |
| **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` enabled** | **No** — **OFF / ABSENT** |
| Production config changed | **No** |
| **`--execute`** | **Not run / prohibited** |
| Runtime / API / worker edits | **None** |

---

## Decision summary

| Item | CCP-4.2 decision |
|------|------------------|
| **Outcome** | **APPROVE NEXT STEP ONLY** |
| **Next candidate** | **CCP-4.3 LINE-only `DB_ONLY` Extended Pilot** |
| **Option A — stay `DB_WITH_ENV_FALLBACK`** | **APPROVED** (current mode) |
| **Option B — LINE extended pilot** | **NEXT CANDIDATE** |
| **Option C — Facebook `DB_ONLY`** | **NOT APPROVED** |
| **Option D — Instagram `DB_ONLY`** | **NOT APPROVED** |
| **Option E — production-wide `DB_ONLY`** | **NOT APPROVED** / **BLOCKED** |

Full matrix: [`channel-connect-db-only-rollout-decision.md` §3](../../channel-connect-db-only-rollout-decision.md#3-decision-matrix).

---

## Evidence summary

- **CCP-4.1:** LINE **`DB_ONLY` smoke SENT** (`61af95ef`); rollback recovery **SENT** (`ffcdac3`); **PASS WITH NOTES**.
- **Gaps:** M3–M6 **NOT CAPTURED**; M7/M8 **PASS WITH NOTE** (no FB/IG **`DB_ONLY`** testing).
- **CCP-3.9:** Long-running **`DB_ONLY` NOT READY** (still valid for production-wide).
- **Final state:** **`DB_WITH_ENV_FALLBACK`** + resolver flag **OFF / ABSENT**.

---

## Final recommendation (CCP-4.2)

**APPROVE NEXT STEP ONLY — CCP-4.3 LINE-only `DB_ONLY` Extended Pilot**

- Do **not** approve production-wide or long-running **`DB_ONLY`**.
- Do **not** approve Facebook or Instagram **`DB_ONLY`** yet.
- Keep production on **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** except during approved controlled windows.
- **`--execute` prohibited**.
- CCP-4.3 must capture Ops/log/leak evidence missing from CCP-4.1; requires **`GO LINE DB_ONLY EXTENDED PILOT`**.

Detail: [`channel-connect-db-only-rollout-decision.md`](../../channel-connect-db-only-rollout-decision.md).

---

## Verification (CCP-4.2 docs-only)

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
| [DB_ONLY rollout decision](../../channel-connect-db-only-rollout-decision.md) | Primary decision artifact |
| [CCP-4.1 execution](./2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md) | Rehearsal evidence |
