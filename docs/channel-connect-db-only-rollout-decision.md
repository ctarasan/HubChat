# Channel Connect — DB_ONLY Rollout Decision (CCP-4.2)

**Status:** Analysis-only — **`DB_ONLY` not enabled**
**Audience:** SmartKorp HubChat ops / Agent A rollout owners
**Last updated:** 2026-06-06
**Master at decision:** `d7b48a1` (PR **#187** CCP-4.1 merged)

**Related agent report:** [`docs/agent-reports/agent-a/2026-06-06-ccp-4-2-db-only-rollout-decision.md`](agent-reports/agent-a/2026-06-06-ccp-4-2-db-only-rollout-decision.md)

---

## CCP-4.2 result

| Item | Decision |
|------|----------|
| **CCP-4.2 outcome** | **APPROVE NEXT STEP ONLY** |
| **Next approved candidate** | **CCP-4.3 LINE-only `DB_ONLY` Extended Pilot** (planning/execution — not enabled by this doc) |
| **Production-wide `DB_ONLY`** | **NOT APPROVED** |
| **Long-running `DB_ONLY`** | **NOT APPROVED** |
| **Facebook / Instagram `DB_ONLY`** | **NOT APPROVED** |
| **Current production mode** | Remain **`DB_WITH_ENV_FALLBACK`** all channels |
| **Resolver flag** | Remain **OFF / ABSENT** except during approved controlled windows |

This phase is **documentation and analysis only**. It does **not** change Railway/Vercel env, credentials, or production config.

---

## 1. Current state

| Item | State |
|------|--------|
| CCP-4.1 controlled LINE **`DB_ONLY` rehearsal** | **COMPLETE** — **PASS WITH NOTES** |
| LINE **`DB_ONLY` controlled smoke | **PASS** — rolled back |
| Rollback | **PASS** — R1–R7 |
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` / `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` left running | **No** |
| Credential migration **`--execute`** | **Not used / prohibited** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Product / runtime code changes (this phase) | **None** |

---

## 2. Evidence reviewed

### Prior phases

| Phase | Result | Relevance |
|-------|--------|-----------|
| [CCP-3.8 execution](agent-reports/agent-a/2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md) | **PASS WITH NOTES** | Resolver under **`DB_WITH_ENV_FALLBACK`**; FB/IG **no new traffic** |
| [CCP-3.9 assessment](channel-connect-db-only-readiness-assessment.md) | **`DB_ONLY` NOT READY** for long-running production | Baseline before CCP-4.0/4.1 |
| [CCP-4.0 rehearsal plan](channel-connect-db-only-rehearsal-plan.md) | Planning complete | Controlled rehearsal framework |
| [CCP-4.1 execution](agent-reports/agent-a/2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md) | **PASS WITH NOTES** | First controlled LINE **`DB_ONLY`** rehearsal |

### CCP-4.1 controlled LINE `DB_ONLY` rehearsal (sanitized)

| Capture | Evidence |
|---------|----------|
| During-window LINE message | `61af95ef`; `created_at` `2026-06-06 09:03:36+00`; **OUTBOUND**; `delivery_status` **SENT** |
| During-window queue job | `875931d0`; `created_at` `2026-06-06 09:03:36+00`; **DONE**; `last_error_empty` = true |
| Post-rollback LINE message | `ffcdac3`; `created_at` `2026-06-06 09:08:55+00`; **OUTBOUND**; `delivery_status` **SENT** |
| Post-rollback queue job | `415b669f`; `created_at` `2026-06-06 09:08:55+00`; **DONE**; `last_error_empty` = true |

### CCP-4.1 gaps (PASS WITH NOTES)

| Check | Status |
|-------|--------|
| M3 Ops Runtime | **NOT CAPTURED** |
| M4 Railway worker logs | **NOT CAPTURED** |
| M5 Vercel logs | **NOT CAPTURED** |
| M6 Secret / token / leak scan | **NOT CAPTURED** |
| M7 Facebook | **PASS WITH NOTE** — no FB **`DB_ONLY`** rehearsal; no active FB traffic |
| M8 Instagram | **PASS WITH NOTE** — no IG **`DB_ONLY`** rehearsal; no active IG traffic |

**Implication:** LINE **`DB_ONLY` send + rollback** is proven for a **short controlled window**. Ops/log/leak confidence for **longer or broader `DB_ONLY`** remains **incomplete**.

---

## 3. Decision matrix

| Option | Description | Decision | Rationale |
|--------|-------------|----------|-----------|
| **A** | Stay **`DB_WITH_ENV_FALLBACK`** for all channels | **APPROVED** (current production mode) | Safest default; env fallback retained; matches post-CCP-4.1 final state |
| **B** | LINE-only **`DB_ONLY` extended pilot** | **NEXT CANDIDATE** → **CCP-4.3** | CCP-4.1 proved short rehearsal; extended pilot must capture M3–M6 gaps before any long-running LINE decision |
| **C** | Facebook **`DB_ONLY` rehearsal** | **NOT APPROVED** (now) | No FB **`DB_ONLY`** evidence; CCP-3.8 no-traffic note is **not** proof; defer to **CCP-4.4** after CCP-4.3 |
| **D** | Instagram **`DB_ONLY` rehearsal** | **NOT APPROVED** (now) | Same as Facebook; defer to **CCP-4.5** after Facebook rehearsal |
| **E** | Production-wide **`DB_ONLY`** (all channels) | **NOT APPROVED** / **BLOCKED** | Missing FB/IG proof; M3–M6 gaps; removes fallback globally; exceeds controlled evidence |

### Summary table

| Option | Decision |
|--------|----------|
| A — Stay **`DB_WITH_ENV_FALLBACK`** | **APPROVED** |
| B — LINE extended pilot | **NEXT CANDIDATE** (CCP-4.3) |
| C — Facebook rehearsal | **NOT APPROVED** |
| D — Instagram rehearsal | **NOT APPROVED** |
| E — Production-wide **`DB_ONLY`** | **NOT APPROVED** / **BLOCKED** |

---

## 4. CCP-4.3 proposed scope — LINE-only `DB_ONLY` Extended Pilot

**Status:** Proposed next phase — **not approved for execution by CCP-4.2 alone**. Requires separate plan + operator **GO**.

| Item | Requirement |
|------|-------------|
| **Scope** | **LINE only** — `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY` during window; FB/IG remain **`DB_WITH_ENV_FALLBACK`** |
| **Duration** | Limited window — e.g. **30–60 minutes** during low traffic |
| **Hard stop** | Required — documented ICT/UTC stop before enable |
| **Rollback owner** | **Chamnan / Operator** |
| **GO phrase** | **`GO LINE DB_ONLY EXTENDED PILOT`** (explicit; not received in CCP-4.2) |
| **Resolver flag** | Only if architecture requires — same controlled-window pattern as CCP-4.1; final state **OFF / ABSENT** |
| **`--execute`** | **Prohibited** |
| **Long-running `DB_ONLY`** | **NOT APPROVED** even if CCP-4.3 passes |

### Must capture (close CCP-4.1 gaps)

| # | Evidence |
|---|----------|
| 1 | Ops Runtime clean (pending / processing / stale / dead-letter vs baseline) |
| 2 | Railway worker logs clean |
| 3 | Vercel logs clean |
| 4 | No secret / token / raw payload leak |
| 5 | LINE outbound **SENT**; `external_message_id` present |
| 6 | Queue **DONE**; `last_error` empty |
| 7 | Post-rollback LINE recovery **SENT** |
| 8 | Final state **`DB_WITH_ENV_FALLBACK`** + resolver flag **OFF / ABSENT** |

### Out of scope for CCP-4.3

- Facebook **`DB_ONLY`**
- Instagram **`DB_ONLY`**
- Production-wide or long-running **`DB_ONLY`**

---

## 5. Facebook / Instagram roadmap

Do **not** use CCP-3.8 **PASS WITH NOTE** (no new FB/IG traffic) as proof of FB/IG **`DB_ONLY`** readiness.

| Phase | Channel | Prerequisite | Requirements |
|-------|---------|--------------|--------------|
| **CCP-4.3** | LINE | CCP-4.2 decision | Extended pilot; M3–M6 evidence; own **GO** phrase |
| **CCP-4.4** | Facebook | **CCP-4.3 PASS** | Own **GO** phrase; test conversation; rollback plan; SQL evidence; Ops/log/leak evidence; active FB outbound smoke |
| **CCP-4.5** | Instagram | **CCP-4.4 PASS** | Same pattern as Facebook for Instagram |

Facebook and Instagram remain on **`DB_WITH_ENV_FALLBACK`** until their respective rehearsal phases pass and a **separate** long-running decision is approved (none approved now).

---

## 6. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| **`DB_ONLY` removes env fallback safety net** | **High** | Credential/DB miss → outbound failure without legacy ENV recovery |
| **M3–M6 not captured in CCP-4.1** | **High** | Ops/log/leak confidence incomplete for longer **`DB_ONLY`** |
| **FB/IG not actively tested under `DB_ONLY`** | **High** | No channel proof; global cutover would be unsafe |
| **Token / credential drift** | **Medium** | DB vs ENV divergence under **`DB_ONLY`** |
| **Provider API behavior changes** | **Medium** | Independent of HubChat mode |
| **Global resolver flag blast radius** | **Medium** | Flag affects LINE + FB + IG when enabled |
| **Historical dead-letter baseline** | **Medium** | Persists from prior ops; monitor during windows |
| **Operator error during env changes** | **Medium** | Wrong var / missed rollback — mitigated by checklists + owner |

---

## 7. Final recommendation

| Recommendation | Detail |
|----------------|--------|
| **CCP-4.2 result** | **APPROVE NEXT STEP ONLY** |
| **Approved next candidate** | **CCP-4.3 LINE-only `DB_ONLY` Extended Pilot** |
| **Current production** | **`DB_WITH_ENV_FALLBACK`** all channels |
| **Resolver flag** | **OFF / ABSENT** unless separate controlled window approves enable |
| **Production-wide `DB_ONLY`** | **NOT APPROVED** |
| **Long-running `DB_ONLY`** | **NOT APPROVED** |
| **Facebook `DB_ONLY`** | **NOT APPROVED** — roadmap **CCP-4.4** |
| **Instagram `DB_ONLY`** | **NOT APPROVED** — roadmap **CCP-4.5** |
| **`--execute`** | **Prohibited** |
| **Broad `DB_ONLY` rollout** | **Not recommended** from current evidence |

**Why CCP-4.3 next:** CCP-4.1 proved a **short** controlled LINE **`DB_ONLY`** smoke and rollback. It did **not** capture Ops Runtime, worker/Vercel logs, or explicit leak checks. An **extended pilot** with mandatory M3–M6-style evidence is the minimum next step before any discussion of long-running LINE **`DB_ONLY`** — still **not** approval for production-wide or FB/IG cutover.

---

## Guardrails (unchanged)

- **`DB_ONLY`:** not enabled by CCP-4.2
- **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`:** **OFF / ABSENT**
- **Production config:** unchanged
- **Long-running / production-wide `DB_ONLY`:** **NOT APPROVED**

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-4.1 execution](agent-reports/agent-a/2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md) | Controlled rehearsal evidence |
| [CCP-4.0 rehearsal plan](channel-connect-db-only-rehearsal-plan.md) | Rehearsal framework |
| [CCP-3.9 assessment](channel-connect-db-only-readiness-assessment.md) | Original readiness verdict |
| [Outbound rollout readiness](channel-connect-outbound-rollout-readiness.md) | CCP-3.1 guardrails |
