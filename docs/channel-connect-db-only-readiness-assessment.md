# Channel Connect — DB_ONLY Readiness Assessment (CCP-3.9)

**Status:** Analysis-only — **DB_ONLY not enabled**
**Audience:** SmartKorp HubChat ops / Agent A rollout owners
**Last updated:** 2026-06-06
**Master at assessment:** `79e595e` (PR **#184** CCP-3.8 merged)

---

## Purpose

Determine whether SmartKorp HubChat is **ready for `DB_ONLY` runtime mode** — not to enable `DB_ONLY`.

This phase is **documentation and analysis only**. It does **not** change Railway/Vercel env, worker behavior, credentials, or production config.

**Related agent report:** [`docs/agent-reports/agent-a/2026-06-06-ccp-3-9-db-only-readiness-assessment.md`](agent-reports/agent-a/2026-06-06-ccp-3-9-db-only-readiness-assessment.md)

---

## Assessment verdict

| Item | Result |
|------|--------|
| **CCP-3.9 DB_ONLY readiness** | **NOT READY** for long-running production `DB_ONLY` |
| **Immediate `DB_ONLY` enablement** | **NOT APPROVED** |
| **Recommended next step** | **CCP-4.0 Controlled DB_ONLY Rehearsal Plan** (planning only) |
| **Current safe production mode** | **`DB_WITH_ENV_FALLBACK`** per provider |
| **Resolver flag** | **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` OFF / ABSENT** |
| **Credential migration `--execute`** | **Prohibited** |

---

## 1. Current rollout state

| Item | State |
|------|--------|
| CCP-3.8 limited extended monitoring | **COMPLETE** — **PASS WITH NOTES** |
| CCP-3.6 controlled LINE resolver window | **PASS** — rolled back |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** — absent from Railway worker env |
| LINE / Facebook / Instagram runtime mode | **`DB_WITH_ENV_FALLBACK`** (current safe mode) |
| `DB_ONLY` | **Disabled / prohibited** — not used in production |
| Long-running resolver flag-on | **NOT APPROVED** |
| Long-running `DB_ONLY` | **NOT APPROVED** |
| Product / runtime code changes (this phase) | **None** |

---

## 2. Evidence reviewed

### Prior controlled windows

| Phase | Result | Relevance to DB_ONLY |
|-------|--------|----------------------|
| [CCP-3.6 execution](agent-reports/agent-a/2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md) | Controlled LINE flag-on **PASS**; rolled back | Proves resolver path + rollback under **`DB_WITH_ENV_FALLBACK`** |
| [CCP-3.8 execution](agent-reports/agent-a/2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md) | **PASS WITH NOTES**; rolled back | Extended monitoring; LINE outbound **SENT**; FB/IG no regression but **no new traffic** |

### CCP-3.8 M1–M7 / R1–R6 summary

| Check | Result | Summary |
|-------|--------|---------|
| M1 | **PASS** | Worker redeploy after flag-on |
| M2 | **PASS** | Worker healthy after redeploy |
| M3 | **PASS** | LINE outbound **SENT** during window |
| M4 | **PASS** | Queue job **DONE**; `last_error` empty |
| M5 | **PASS WITH NOTE** | Active queues clean; warning from **historical** dead-letter baseline only |
| M6 | **PASS WITH NOTE** | No new Facebook failures; **no new FB traffic** during window |
| M7 | **PASS WITH NOTE** | No new Instagram failures; **no new IG traffic** during window |
| R1–R6 | **PASS** | Flag removed; redeploy; recovery smoke **SENT**; final flag **OFF / ABSENT** |

### LINE outbound evidence (during window)

| Field | Value |
|-------|--------|
| Message row (partial ID) | `973bef18` |
| Direction | **OUTBOUND** |
| `created_at` | `2026-06-06 07:51:59+00` |
| `external_message_id_present` | true |
| `delivery_status` | **SENT** |
| Queue job (partial ID) | `3a3eeb52` |
| Job type | `message.outbound.requested` |
| Job `created_at` | `2026-06-06 07:51:59+00` |
| Job `status` | **DONE** |
| `last_error_empty` | true |

### Post-rollback LINE recovery

| Field | Value |
|-------|--------|
| Message row (partial ID) | `fd117c7a` |
| Direction | **OUTBOUND** |
| `created_at` | `2026-06-06 08:03:48+00` |
| `external_message_id_present` | true |
| Queue job (partial ID) | `6661d60f` |
| Job `created_at` | `2026-06-06 08:03:48+00` |
| Job `status` | **DONE** |
| `last_error_empty` | true |

### Ops and channel monitoring notes

- **M5:** Ops Runtime **PASS WITH NOTE** — queue/outbox active counts were 0; inbound dead letter = 6 and outbound queue dead letter = 26 reflect **historical baseline**, not window regression.
- **M6 / M7:** **PASS WITH NOTE** — no observed FB/IG regression, but **no new Facebook or Instagram outbound traffic** occurred during CCP-3.8; regression signal is **limited**.

---

## 3. DB_ONLY readiness criteria

Each criterion evaluated for **long-running production `DB_ONLY`**. Ratings: **PASS** / **PASS WITH NOTE** / **BLOCKED** / **UNKNOWN**.

| # | Criterion | Rating | Rationale |
|---|-----------|--------|-----------|
| 1 | DB credentials exist for LINE / Facebook / Instagram | **PASS WITH NOTE** | CCP-1 vault populated for production tenant; metadata/fingerprint verified in prior phases — **no `--execute` in this assessment** |
| 2 | Channel Settings **Test connection READY** per channel | **PASS** | LINE / Facebook / Instagram **READY** recorded in CCP-3.8 pre-window P7 |
| 3 | Resolver flag controlled windows passed | **PASS WITH NOTE** | CCP-3.6 + CCP-3.8 **PASS** under **`DB_WITH_ENV_FALLBACK`**; long-running flag-on **not approved** |
| 4 | LINE outbound works through resolver path | **PASS** | CCP-3.8 M3/M4 **SENT** / **DONE** with resolver flag on |
| 5 | Rollback works and returns to **OFF / ABSENT** | **PASS** | CCP-3.8 R1–R6 **PASS**; recovery smoke **SENT** |
| 6 | Ops Runtime remains clean during window | **PASS WITH NOTE** | Active processing clean; historical dead-letter baseline persists |
| 7 | No active queue/outbox regression | **PASS** | No new stale **PROCESSING** or unexpected active dead-letter growth during window |
| 8 | No secret/token/raw payload leak observed | **PASS** | CCP-3.8 M9 **PASS**; sanitized evidence only |
| 9 | Facebook / Instagram no regression; traffic coverage | **PASS WITH NOTE** | No new failures after flag-on; **no new FB/IG traffic** in CCP-3.8 — **insufficient for DB_ONLY confidence** |
| 10 | Worker logs and Vercel logs coverage | **PASS WITH NOTE** | Worker logs clean in controlled windows; **`DB_ONLY`-specific failure modes not rehearsed** |
| 11 | Operator rollback procedure proven | **PASS** | CCP-3.6 + CCP-3.8 rollback to flag **OFF / ABSENT** proven |
| 12 | Runbook and evidence coverage sufficient for **`DB_ONLY`** | **BLOCKED** | No controlled **`DB_ONLY`** rehearsal; no per-provider **`DB_ONLY`** rollback drill; [`channel-connect-outbound-rollout-readiness.md`](channel-connect-outbound-rollout-readiness.md) explicitly defers **`DB_ONLY`** |

**Criteria summary:** Strong evidence for **`DB_WITH_ENV_FALLBACK` + controlled resolver flag** on LINE. **Insufficient evidence** to approve removing the env fallback safety net via **`DB_ONLY`**.

---

## 4. Risk assessment

| Risk | Severity | Notes |
|------|----------|-------|
| **`DB_ONLY` removes env fallback safety net** | **High** | Misconfigured or missing DB credential → outbound failure with **no legacy ENV recovery** |
| Facebook / Instagram not actively traffic-tested in CCP-3.8 | **High** | No-regression signal only; **`DB_ONLY` on FB/IG untested under live outbound** |
| Historical dead-letter baseline persists | **Medium** | Inbound DL = 6; outbound queue DL = 26 — not window-caused but adds ops noise |
| Token / credential drift | **Medium** | DB vs ENV divergence undetectable under **`DB_ONLY`** until send failure |
| Provider API behavior changes | **Medium** | Independent of HubChat mode; fallback helps during incidents |
| Need stronger monitoring before **`DB_ONLY`** | **High** | Require **`configSource: DB`** proof, no unexpected **`ENV_FALLBACK`**, per-channel smokes |
| Need controlled **`DB_ONLY`** rehearsal before any long-running **`DB_ONLY`** | **High** | Short window, rollback checklist, FB/IG active traffic decision — **CCP-4.0** |

---

## 5. Recommendation

**Do not enable `DB_ONLY` in production now.**

| Recommendation | Detail |
|----------------|--------|
| **`DB_ONLY` long-running production** | **NOT APPROVED** |
| **Current production mode** | Keep **`DB_WITH_ENV_FALLBACK`** for LINE / Facebook / Instagram |
| **Resolver flag** | Keep **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` OFF / ABSENT** unless a **separate approved controlled window** authorizes flag-on |
| **`--execute`** | **Continue prohibiting** credential migration execute |
| **Next phase** | **CCP-4.0 Controlled DB_ONLY Rehearsal Plan** (planning only — no enablement) |

**Why not ready:** Controlled evidence proves resolver + rollback under **`DB_WITH_ENV_FALLBACK`**, not under **`DB_ONLY`**. Facebook and Instagram lack active outbound exercise during the latest window. Runbooks require stable DB path without unexpected fallback before **`DB_ONLY`** — that bar is **not met**.

---

## 6. Next-phase proposal — CCP-4.0 (planning only)

**CCP-4.0 Controlled DB_ONLY Rehearsal Plan** — docs-only planning phase; **no production `DB_ONLY` enablement**.

Proposed plan contents:

| Section | Purpose |
|---------|---------|
| **DB_ONLY rehearsal plan** | Short controlled window per provider or phased sequence |
| **Per-channel scope** | LINE first vs simultaneous FB/IG — explicit GO/NO-GO per channel |
| **Rollback checklist** | Revert `HUBCHAT_*_RUNTIME_CONFIG_MODE` to **`DB_WITH_ENV_FALLBACK`**; flag **OFF / ABSENT**; redeploy worker |
| **Exact env changes** | Railway worker variable names only; literal values documented; no secrets |
| **Hard stop** | Time-boxed window + rollback owner |
| **Smoke SQL** | Metadata/fingerprint queries only — no plaintext credentials in git |
| **Ops Runtime checks** | Pending/processing/stale/dead-letter before, during, after |
| **Worker / Vercel log checks** | Resolver, auth, provider errors; leak scan |
| **FB/IG active traffic decision** | Require intentional outbound smokes if **`DB_ONLY`** scope includes FB/IG |
| **GO / NO-GO gates** | Pre-window checklist; stop conditions; final state **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT** unless separate long-running approval |

**CCP-4.0 complete (2026-06-06):** [`channel-connect-db-only-rehearsal-plan.md`](channel-connect-db-only-rehearsal-plan.md). Execution: **CCP-4.1** after **`GO CONTROLLED DB_ONLY REHEARSAL`**.

---

## Guardrails (unchanged)

- **`DB_ONLY`:** not enabled; not approved for long-running production
- **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`:** **OFF / ABSENT**
- **`--execute`:** prohibited
- **Production config:** unchanged by this assessment
- **Long-running flag-on:** not approved

---

## Related docs

| Document | Use |
|----------|-----|
| [DB_ONLY rehearsal plan](channel-connect-db-only-rehearsal-plan.md) | CCP-4.0 controlled rehearsal plan |
| [CCP-3.8 execution](agent-reports/agent-a/2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md) | Latest controlled window evidence |
| [CCP-3.6 execution](agent-reports/agent-a/2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md) | Prior controlled window |
| [Outbound rollout readiness](channel-connect-outbound-rollout-readiness.md) | CCP-3.1 rollout guardrails |
| [Evidence pack](channel-connect-outbound-rollout-evidence-pack.md) | Pilot evidence rows |
