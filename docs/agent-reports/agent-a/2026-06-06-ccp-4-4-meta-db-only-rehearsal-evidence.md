# CCP-4.4 — Meta DB_ONLY Rehearsal Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Meta **`DB_ONLY` Rehearsal COMPLETE** — Facebook + Instagram rolled back to **`DB_WITH_ENV_FALLBACK`**
**Result:** **PASS WITH NOTES**
**PR:** [#190](https://github.com/ctarasan/HubChat/pull/190)
**Master at capture:** `2048d64` (PR **#189** CCP-4.3 merged)
**Operator:** Chamnan / Operator — sanitized report to Agent A; no secrets in artifact
**Prior:** [CCP-4.3 pilot](./2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md) · [CCP-4.2 decision](../../channel-connect-db-only-rollout-decision.md) · [CCP-4.1 execution](./2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md)

---

## Goal

Prepare execution evidence for **two separate controlled Meta `DB_ONLY` rehearsals**:

1. **Facebook `DB_ONLY` Rehearsal** — requires **`GO FACEBOOK DB_ONLY REHEARSAL`**
2. **Instagram `DB_ONLY` Rehearsal** — requires **`GO INSTAGRAM DB_ONLY REHEARSAL`**

Record preflight, per-channel window actions, monitoring, rollback, and final decision — **without** enabling Facebook or Instagram `DB_ONLY` until operator explicit **GO** phrases.

**Do not run Facebook and Instagram `DB_ONLY` in the same window.** Roll back Facebook before starting Instagram.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Preflight P1–P20 | Long-running **`DB_ONLY`** |
| Facebook window F-D / F-M / F-R | Production-wide **`DB_ONLY`** |
| Instagram window I-D / I-M / I-R | Simultaneous FB + IG **`DB_ONLY`** |
| Separate controlled windows | Credential migration **`--execute`** |
| Read-only SQL checks | Product / worker / API changes |
| LINE remains **`DB_WITH_ENV_FALLBACK`** | LINE **`DB_ONLY`** (proven in CCP-4.1 / CCP-4.3) |

**Final required state after each window:** affected channel → **`DB_WITH_ENV_FALLBACK`**; LINE **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT**.

---

## Guardrails

| Guardrail | Status (CCP-4.4) |
|-----------|------------------|
| Agent A enabled Facebook / Instagram **`DB_ONLY`** | **No** — operator only during approved windows |
| Operator **GO FACEBOOK DB_ONLY REHEARSAL** | **Yes** — Facebook window executed |
| Operator **GO INSTAGRAM DB_ONLY REHEARSAL** | **Yes** — Instagram window executed (after Facebook rollback) |
| Facebook + Instagram **`DB_ONLY` simultaneous** | **No** — separate windows |
| Production env changes | **Operator only** (windows + rollbacks); final state safe |
| `DB_ONLY` left running | **No** — rolled back |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| **`--execute`** | **Not run / prohibited** |
| Product / runtime code changes | **None** |
| Secret/token/raw payload values in this doc | **None** (partial row/job IDs only) |

---

## Current production state (post-rollback — final)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (F-R8 **PASS**) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (I-R8 **PASS**) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (F-R2 / I-R2 **PASS**) |
| `DB_ONLY` on any channel | **Not running** — rolled back |
| CCP-4.4 Meta rehearsals | **COMPLETE** — separate FB then IG windows |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

### Channel Settings baseline (operator — sanitized)

| Channel | Configured | Status | Last error | Credentials (labels only) |
|---------|------------|--------|------------|---------------------------|
| **Facebook** | **Yes** | **READY** | **None recorded** | Page access token **SET**; app secret **SET** — values **not exposed** |
| **Instagram** | **Yes** | **READY** | **None recorded** | Access token **SET**; verify token **SET** — values **not exposed** |

---

## Preflight checklist P1–P20

Complete **immediately before** Meta rehearsals. **CCP-4.4 operator verification:** P1–P20 **PASS**.

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `2048d64` — `git pull --ff-only` clean |
| P2 | PR **#189** (CCP-4.3) included in `master` | Merge commit on `master` | **PASS** | PR **#189** merged |
| P3 | Production mode **`DB_WITH_ENV_FALLBACK`** | LINE / FB / IG on fallback | **PASS** | Documented safe state |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` absent | **PASS** | Flag **OFF / ABSENT** |
| P5 | LINE runtime restored | **`DB_WITH_ENV_FALLBACK`** | **PASS** | CCP-4.3 rolled back; LINE not on **`DB_ONLY`** |
| P6 | Facebook **`DB_ONLY` not enabled** (pre-window) | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-window baseline |
| P7 | Instagram **`DB_ONLY` not enabled** (pre-window) | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-window baseline |
| P8 | **`--execute` not used / prohibited** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P9 | Railway worker healthy | `/ready` OK | **PASS** | Health confirmed before Meta rehearsals |
| P10 | Vercel app/API healthy | Production **Ready** | **PASS** | Vercel/API healthy before Meta rehearsals |
| P11 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter recorded | **PASS** | Baseline captured before Meta rehearsals |
| P12 | Historical dead-letter baseline documented | Record current baselines | **PASS** | Inbound queue dead letter **6**; outbound queue dead letter **26** — historical baseline |
| P13 | Facebook Channel Settings **READY** | Test connection **READY** | **PASS** | Configured **Yes**; status **READY**; last error **None recorded** |
| P14 | Facebook DB credentials present | Metadata ready for **`DB_ONLY`** | **PASS** | Page access token **SET**; app secret **SET** — values **not viewed or exposed** |
| P15 | Instagram Channel Settings **READY** | Test connection **READY** | **PASS** | Configured **Yes**; status **READY**; last error **None recorded** |
| P16 | Instagram DB credentials present | Metadata ready for **`DB_ONLY`** | **PASS** | Access token **SET**; verify token **SET** — values **not viewed or exposed** |
| P17 | Rollback owner assigned | Owner for window + rollback | **PASS** | **Chamnan / Operator** |
| P18 | Facebook **GO** phrase | **`GO FACEBOOK DB_ONLY REHEARSAL`** | **PASS** | **`GO FACEBOOK DB_ONLY REHEARSAL`** received |
| P19 | Instagram **GO** phrase | **`GO INSTAGRAM DB_ONLY REHEARSAL`** | **PASS** | **`GO INSTAGRAM DB_ONLY REHEARSAL`** received (after Facebook rollback) |
| P20 | Decision before execution | Operator **GO** received | **PASS** | Both windows authorized and executed |

**Preflight gate — Facebook:** P1–P20 applicable items **PASS** + **`GO FACEBOOK DB_ONLY REHEARSAL`** → may begin F-D1–F-D5.

**Preflight gate — Instagram:** Facebook window **complete and rolled back** + P1–P20 **PASS** + **`GO INSTAGRAM DB_ONLY REHEARSAL`** → may begin I-D1–I-D5. **Do not start Instagram if Facebook failed** unless operator explicitly approves.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.2 roadmap | Facebook **CCP-4.4** then Instagram **CCP-4.4** (separate windows) |
| LINE **`DB_ONLY` pilots** | **COMPLETE** (CCP-4.1 / CCP-4.3) — LINE stays **`DB_WITH_ENV_FALLBACK`** |
| **GO FACEBOOK DB_ONLY REHEARSAL** | **Received** — window **COMPLETE** |
| **GO INSTAGRAM DB_ONLY REHEARSAL** | **Received** — window **COMPLETE** (after Facebook rollback) |
| Facebook rolled back before Instagram | **Yes** |
| Meta rehearsals | **COMPLETE** — **PASS WITH NOTES** |

---

## Execution rules (Meta rehearsals)

| Rule | Detail |
|------|--------|
| Separate windows | Run **Facebook** and **Instagram** in **separate** controlled windows |
| No simultaneous enable | Do **not** enable Facebook and Instagram **`DB_ONLY`** at the same time |
| Order | Complete Facebook window + rollback **before** Instagram window |
| Facebook failure | If Facebook fails, **do not** proceed to Instagram unless operator explicitly approves |
| LINE unchanged | LINE remains **`DB_WITH_ENV_FALLBACK`** during Meta rehearsals |
| Resolver flag | Enable only if architecture requires; final state **OFF / ABSENT** after each rollback |
| Production-wide / long-running | **NOT APPROVED** |
| **`--execute`** | **Prohibited** |
| Secrets | Do **not** expose secret/token/raw payload values in evidence |

---

## Facebook window — F-D / F-M / F-R

Executed after **`GO FACEBOOK DB_ONLY REHEARSAL`**. Operator-run; sanitized evidence recorded by Agent A.

### Facebook window actions F-D1–F-D5

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| F-D1 | **GO time** captured | **`GO FACEBOOK DB_ONLY REHEARSAL`** + UTC | **PASS** | Operator phrase: **`GO FACEBOOK DB_ONLY REHEARSAL`** |
| F-D2 | Facebook runtime → **`DB_ONLY`** | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_ONLY`; LINE/IG unchanged | **PASS** | Controlled Facebook **`DB_ONLY`** smoke succeeded (F-M1) |
| F-D3 | Resolver flag if required | Enable only if architecture requires | **NOT REQUIRED** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **absent** from Railway; pilot used Facebook runtime mode only |
| F-D4 | Railway worker redeployed | Redeploy confirmed | **PASS** | Worker redeploy after env change confirmed |
| F-D5 | Worker healthy after redeploy | `/ready` OK | **PASS** | Health confirmed after redeploy |

### Facebook monitoring F-M1–F-M6

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| F-M1 | Facebook outbound smoke | **SENT**; `external_message_id` present | **PASS** | Message `a82c7c0a`; **OUTBOUND**; `channel_type` **FACEBOOK**; `created_at` `2026-06-06 11:28:13+00`; `external_message_id_present` = true. **Note:** earlier row `2979c46e` @ `11:26:09+00` had `external_message_id_present` = false — **not a blocker**; controlled smoke **a82c7c0a** succeeded |
| F-M2 | Queue job | **DONE**; `last_error` empty | **PASS** | Job `7f3e2d93`; `created_at` `2026-06-06 11:28:13+00`; **DONE**; `last_error_empty` = true |
| F-M3 | Ops Runtime clean | vs P11/P12 baseline | **PASS** | Ops Runtime clean after Facebook smoke |
| F-M4 | Railway worker logs clean | No errors; no leak | **PASS** | Worker logs clean |
| F-M5 | Vercel logs clean | No critical API/auth errors | **PASS** | Vercel logs clean |
| F-M6 | No secret/token/raw payload leak | None observed | **PASS** | No leak observed |

### Facebook rollback F-R1–F-R8

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| F-R1 | Restore Facebook runtime | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | Facebook runtime restored to **`DB_WITH_ENV_FALLBACK`** |
| F-R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |
| F-R3 | Redeploy Railway worker | Redeploy confirmed | **PASS** | Worker redeploy after Facebook rollback confirmed |
| F-R4 | Worker healthy | `/ready` OK | **PASS** | Health confirmed after rollback |
| F-R5 | Post-rollback Facebook recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `876ffdc4`; **OUTBOUND**; `channel_type` **FACEBOOK**; `created_at` `2026-06-06 11:44:53+00`; `external_message_id_present` = true. **Note:** earlier row `a727b5e8` @ `11:44:00+00` had `external_message_id_present` = false — **not a blocker**; recovery smoke **876ffdc4** succeeded |
| F-R6 | Post-rollback queue job | **DONE**; `last_error` empty | **PASS** | Job `9b1553e1`; `created_at` `2026-06-06 11:44:53+00`; **DONE**; `last_error_empty` = true |
| F-R7 | Ops Runtime clean after rollback | No new critical issue | **PASS** | Ops Runtime clean after Facebook rollback |
| F-R8 | Final Facebook state | **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** | **PASS** | Facebook **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** |

| Field | Value |
|-------|--------|
| Facebook controlled smoke (UTC) | `2026-06-06 11:28:13+00` |
| Facebook recovery smoke (UTC) | `2026-06-06 11:44:53+00` |

---

## Instagram window — I-D / I-M / I-R

Executed after **`GO INSTAGRAM DB_ONLY REHEARSAL`** and Facebook window **rolled back**. Operator-run; sanitized evidence recorded by Agent A.

### Instagram window actions I-D1–I-D5

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| I-D1 | **GO time** captured | **`GO INSTAGRAM DB_ONLY REHEARSAL`** + UTC | **PASS** | Operator phrase: **`GO INSTAGRAM DB_ONLY REHEARSAL`** |
| I-D2 | Instagram runtime → **`DB_ONLY`** | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY`; LINE/FB unchanged | **PASS** | Controlled Instagram **`DB_ONLY`** smoke succeeded (I-M1) |
| I-D3 | Resolver flag if required | Enable only if architecture requires | **NOT REQUIRED** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **absent** from Railway; pilot used Instagram runtime mode only |
| I-D4 | Railway worker redeployed | Redeploy confirmed | **PASS** | Worker redeploy after env change confirmed |
| I-D5 | Worker healthy after redeploy | `/ready` OK | **PASS** | Health confirmed after redeploy |

### Instagram monitoring I-M1–I-M6

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| I-M1 | Instagram outbound smoke | **SENT**; `external_message_id` present | **PASS** | Message `45488476`; **OUTBOUND**; `channel_type` **INSTAGRAM**; `created_at` `2026-06-06 12:00:18+00`; `external_message_id_present` = true. **Note:** earlier row `03d74038` @ `11:59:07+00` had `external_message_id_present` = false — **not a blocker**; controlled smoke **45488476** succeeded |
| I-M2 | Queue job | **DONE**; `last_error` empty | **PASS** | Job `5d9b61af`; `created_at` `2026-06-06 12:00:18+00`; **DONE**; `last_error_empty` = true |
| I-M3 | Ops Runtime clean | vs baseline | **PASS** | Ops Runtime clean after Instagram smoke |
| I-M4 | Railway worker logs clean | No errors; no leak | **PASS** | Worker logs clean |
| I-M5 | Vercel logs clean | No critical errors | **PASS** | Vercel logs clean |
| I-M6 | No secret/token/raw payload leak | None observed | **PASS** | No leak observed |

### Instagram rollback I-R1–I-R8

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| I-R1 | Restore Instagram runtime | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | Instagram runtime restored to **`DB_WITH_ENV_FALLBACK`** |
| I-R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |
| I-R3 | Redeploy Railway worker | Redeploy confirmed | **PASS** | Worker redeploy after Instagram rollback confirmed |
| I-R4 | Worker healthy | `/ready` OK | **PASS** | Health confirmed after rollback |
| I-R5 | Post-rollback Instagram recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `e62eb8ac`; **OUTBOUND**; `channel_type` **INSTAGRAM**; `created_at` `2026-06-06 12:05:29+00`; `external_message_id_present` = true |
| I-R6 | Post-rollback queue job | **DONE**; `last_error` empty | **PASS** | Job `6ddfd5cf`; `created_at` `2026-06-06 12:05:29+00`; **DONE**; `last_error_empty` = true |
| I-R7 | Ops Runtime clean after rollback | No new critical issue | **PASS** | Ops Runtime clean after Instagram rollback |
| I-R8 | Final Instagram state | **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** | **PASS** | Instagram **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** |

| Field | Value |
|-------|--------|
| Instagram controlled smoke (UTC) | `2026-06-06 12:00:18+00` |
| Instagram recovery smoke (UTC) | `2026-06-06 12:05:29+00` |

---

## SQL smoke queries (read-only)

Replace `<GO_TIME_UTC>` with window start timestamp. **Never commit secrets or full payloads.**

### Latest Facebook / Instagram outbound messages

```sql
select
  left(id::text, 8) as message_id_short,
  created_at,
  channel_type,
  direction,
  external_message_id is not null as external_message_id_present,
  metadata_json
from messages
where direction = 'OUTBOUND'
  and channel_type in ('FACEBOOK', 'INSTAGRAM')
order by created_at desc
limit 10;
```

### Latest `message.outbound.requested` queue jobs

```sql
select
  left(id::text, 8) as job_id_short,
  created_at,
  topic,
  status,
  coalesce(last_error, '') = '' as last_error_empty
from queue_jobs
where topic = 'message.outbound.requested'
order by created_at desc
limit 10;
```

### Suspected Meta failures after GO time

```sql
select
  channel_type,
  direction,
  count(*) as total,
  count(*) filter (
    where metadata_json::text ilike '%FAILED%'
       or metadata_json::text ilike '%ERROR%'
       or metadata_json::text ilike '%exception%'
  ) as suspected_error_count
from messages
where channel_type in ('FACEBOOK', 'INSTAGRAM')
  and created_at >= '<GO_TIME_UTC>'
group by channel_type, direction
order by channel_type, direction;
```

**Note:** Prefer `metadata_json->>'delivery_status'` and sanitized error prefixes over broad `ilike` when capturing evidence; use above for quick regression scan only.

---

## Stop conditions (immediate rollback)

| Condition | Action |
|-----------|--------|
| Channel smoke fails | Rollback F-R1–F-R8 or I-R1–I-R8 |
| Queue not **DONE** | Rollback |
| `last_error` non-empty on success path | Rollback |
| `delivery_status` not **SENT** | Rollback |
| Worker crash / restart loop | Rollback |
| Ops Runtime regression | Rollback |
| Secret / token / raw payload leak | Rollback + SEC incident |
| Other channel unexpected errors attributable to window | Rollback |
| Attempt to enable FB + IG **`DB_ONLY` simultaneously** | **STOP** — separate windows only |

---

## Final decision (CCP-4.4)

**PASS WITH NOTES — Meta `DB_ONLY` Rehearsal COMPLETE and Rolled Back**

| Item | State |
|------|--------|
| CCP-4.4 Meta **`DB_ONLY` rehearsal** | **COMPLETE** |
| Result | **PASS WITH NOTES** |
| Facebook controlled rehearsal | **PASS** — F-D / F-M / F-R **PASS** |
| Facebook rollback | **PASS** |
| Instagram controlled rehearsal | **PASS** — I-D / I-M / I-R **PASS** |
| Instagram rollback | **PASS** |
| Final production state | LINE / Facebook / Instagram **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** |
| `DB_ONLY` left running | **No** |
| **`--execute`** | **Not used / prohibited** |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Product / runtime code changes | **None** |
| Rollback owner | **Chamnan / Operator** |

**Notes (PASS WITH NOTES rationale):**

- Transparent notes on earlier Facebook rows **`2979c46e`** (pre-smoke) and **`a727b5e8`** (pre-recovery) and Instagram row **`03d74038`** (pre-smoke) with `external_message_id_present` = false — **not blockers**; controlled smokes and recovery smokes **PASS**.
- F-D3 / I-D3: Resolver flag **NOT REQUIRED** — remained **OFF / ABSENT** throughout.
- **Controlled rehearsal success does not approve long-running or production-wide `DB_ONLY`.** Meta **`DB_ONLY` is not permanently safe** from this evidence alone.

**Next phase candidate:** **CCP-4.5 All-channel `DB_ONLY` Pilot** — only after separate review and explicit **GO** (not approved by CCP-4.4).

**Not approved / not recommended:**

- Production-wide **`DB_ONLY`** — **NOT APPROVED**
- Long-running **`DB_ONLY`** — **NOT APPROVED**
- Broad **`DB_ONLY` rollout** — **not recommended** from CCP-4.4 alone

### Final production state (confirmed post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-4.2 rollout decision](../../channel-connect-db-only-rollout-decision.md) | FB → IG roadmap |
| [CCP-4.3 pilot](./2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md) | LINE precedent |
| [CCP-4.0 rehearsal plan](../../channel-connect-db-only-rehearsal-plan.md) | Rollback patterns |
| [Worker queue observability](../../hubchat-worker-queue-observability-runbook.md) | Ops baselines |

---

## Verification (CCP-4.4 docs-only)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| Facebook / Instagram **`DB_ONLY` enabled (final state)** | **No** — rolled back |
| Resolver flag (final state) | **OFF / ABSENT** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |
