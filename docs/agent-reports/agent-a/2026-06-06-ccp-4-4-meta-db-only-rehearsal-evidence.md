# CCP-4.4 — Meta DB_ONLY Rehearsal Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Preflight **complete** — **HOLD — AWAITING GO FACEBOOK DB_ONLY REHEARSAL / GO INSTAGRAM DB_ONLY REHEARSAL** (rehearsals not executed)
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

| Guardrail | Status (CCP-4.4 Agent A session) |
|-----------|----------------------------------|
| Agent A enabled Facebook **`DB_ONLY`** | **No** |
| Agent A enabled Instagram **`DB_ONLY`** | **No** |
| Operator **GO FACEBOOK DB_ONLY REHEARSAL** | **No** |
| Operator **GO INSTAGRAM DB_ONLY REHEARSAL** | **No** |
| Facebook + Instagram **`DB_ONLY` simultaneous** | **Prohibited** |
| Production env changes | **None** |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| **`--execute`** | **Not run / prohibited** |
| Secret/token/raw payload values in this doc | **None** (labels SET only) |

---

## Current production state (pre-rehearsal)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (P5 **PASS**) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (P6 **PASS**) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (P7 **PASS**) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (P4 **PASS**) |
| Facebook **`DB_ONLY` enabled** | **No** (P6 **PASS**) |
| Instagram **`DB_ONLY` enabled** | **No** (P7 **PASS**) |
| CCP-4.4 Meta rehearsals executed | **No** |

### Channel Settings baseline (operator — sanitized)

| Channel | Configured | Status | Last error | Credentials (labels only) |
|---------|------------|--------|------------|---------------------------|
| **Facebook** | **Yes** | **READY** | **None recorded** | Page access token **SET**; app secret **SET** — values **not exposed** |
| **Instagram** | **Yes** | **READY** | **None recorded** | Access token **SET**; verify token **SET** — values **not exposed** |

---

## Preflight checklist P1–P20

Complete **immediately before** each Meta rehearsal window. **CCP-4.4 Agent A session:** repo/safe-state and channel baseline **PASS**; live ops checks **NOT RUN** until pre-window verification.

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `2048d64` — `git pull --ff-only` clean |
| P2 | PR **#189** (CCP-4.3) included in `master` | Merge commit on `master` | **PASS** | PR **#189** merged |
| P3 | Production mode **`DB_WITH_ENV_FALLBACK`** | LINE / FB / IG on fallback | **PASS** | Documented safe state |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` absent | **PASS** | Flag **OFF / ABSENT** |
| P5 | LINE runtime restored | **`DB_WITH_ENV_FALLBACK`** | **PASS** | CCP-4.3 rolled back; LINE not on **`DB_ONLY`** |
| P6 | Facebook **`DB_ONLY` not enabled** | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Facebook **`DB_ONLY` not enabled** |
| P7 | Instagram **`DB_ONLY` not enabled** | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Instagram **`DB_ONLY` not enabled** |
| P8 | **`--execute` not used / prohibited** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P9 | Railway worker healthy | `/ready` OK | **NOT RUN** | Awaiting operator pre-window verify |
| P10 | Vercel app/API healthy | Production **Ready** | **NOT RUN** | Awaiting operator pre-window verify |
| P11 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter recorded | **NOT RUN** | Awaiting operator baseline capture |
| P12 | Historical dead-letter baseline documented | Record current baselines | **NOT RUN** | Verify vs prior: inbound DL ≈ **6**, outbound queue DL ≈ **26** |
| P13 | Facebook Channel Settings **READY** | Test connection **READY** | **PASS** | Configured **Yes**; status **READY**; last error **None recorded** |
| P14 | Facebook DB credentials present | Metadata ready for **`DB_ONLY`** | **PASS** | Page access token **SET**; app secret **SET** — values **not viewed or exposed** |
| P15 | Instagram Channel Settings **READY** | Test connection **READY** | **PASS** | Configured **Yes**; status **READY**; last error **None recorded** |
| P16 | Instagram DB credentials present | Metadata ready for **`DB_ONLY`** | **PASS** | Access token **SET**; verify token **SET** — values **not viewed or exposed** |
| P17 | Rollback owner assigned | Owner for window + rollback | **PASS** | **Chamnan / Operator** |
| P18 | Facebook **GO** phrase | **`GO FACEBOOK DB_ONLY REHEARSAL`** | **PASS** | Phrase documented; **not received** |
| P19 | Instagram **GO** phrase | **`GO INSTAGRAM DB_ONLY REHEARSAL`** | **PASS** | Phrase documented; **not received** |
| P20 | Decision before execution | **HOLD** | **HOLD** | Awaiting **GO FACEBOOK DB_ONLY REHEARSAL** / **GO INSTAGRAM DB_ONLY REHEARSAL** |

**Preflight gate — Facebook:** P1–P20 applicable items **PASS** + **`GO FACEBOOK DB_ONLY REHEARSAL`** → may begin F-D1–F-D5.

**Preflight gate — Instagram:** Facebook window **complete and rolled back** + P1–P20 **PASS** + **`GO INSTAGRAM DB_ONLY REHEARSAL`** → may begin I-D1–I-D5. **Do not start Instagram if Facebook failed** unless operator explicitly approves.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.2 roadmap | Facebook **CCP-4.4** then Instagram **CCP-4.4** (separate windows) |
| LINE **`DB_ONLY` pilots** | **COMPLETE** (CCP-4.1 / CCP-4.3) — LINE stays **`DB_WITH_ENV_FALLBACK`** |
| **GO FACEBOOK DB_ONLY REHEARSAL** | **Not received** |
| **GO INSTAGRAM DB_ONLY REHEARSAL** | **Not received** |
| Simultaneous FB + IG **`DB_ONLY`** | **Prohibited** |
| Rollback owner | **Chamnan / Operator** |

**Do not enable Facebook `DB_ONLY` until: `GO FACEBOOK DB_ONLY REHEARSAL`**

**Do not enable Instagram `DB_ONLY` until: `GO INSTAGRAM DB_ONLY REHEARSAL`** (and Facebook rolled back if Facebook window was run)

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

Execute **only** after **`GO FACEBOOK DB_ONLY REHEARSAL`**. **Not executed in this Agent A session.**

### Facebook window actions F-D1–F-D5

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| F-D1 | **GO time** captured | **`GO FACEBOOK DB_ONLY REHEARSAL`** + UTC | **NOT RUN** | |
| F-D2 | Facebook runtime → **`DB_ONLY`** | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_ONLY`; LINE/IG unchanged | **NOT RUN** | |
| F-D3 | Resolver flag if required | Enable only if architecture requires | **NOT RUN** | **NOT REQUIRED** if absent (per CCP-4.3 pattern) |
| F-D4 | Railway worker redeployed | Redeploy confirmed | **NOT RUN** | |
| F-D5 | Worker healthy after redeploy | `/ready` OK | **NOT RUN** | |

### Facebook monitoring F-M1–F-M6

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| F-M1 | Facebook outbound smoke | **SENT**; `external_message_id` present | **NOT RUN** | Message id short: _____ |
| F-M2 | Queue job | **DONE**; `last_error` empty | **NOT RUN** | Job id short: _____ |
| F-M3 | Ops Runtime clean | vs P11/P12 baseline | **NOT RUN** | |
| F-M4 | Railway worker logs clean | No errors; no leak | **NOT RUN** | |
| F-M5 | Vercel logs clean | No critical API/auth errors | **NOT RUN** | |
| F-M6 | No secret/token/raw payload leak | None observed | **NOT RUN** | |

### Facebook rollback F-R1–F-R8

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| F-R1 | Restore Facebook runtime | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **NOT RUN** | |
| F-R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **NOT RUN** | |
| F-R3 | Redeploy Railway worker | Redeploy confirmed | **NOT RUN** | |
| F-R4 | Worker healthy | `/ready` OK | **NOT RUN** | |
| F-R5 | Post-rollback Facebook recovery smoke | **SENT**; `external_message_id` present | **NOT RUN** | |
| F-R6 | Post-rollback queue job | **DONE**; `last_error` empty | **NOT RUN** | |
| F-R7 | Ops Runtime clean after rollback | No new critical issue | **NOT RUN** | |
| F-R8 | Final Facebook state | **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** | **NOT RUN** | |

| Field | Placeholder |
|-------|-------------|
| Facebook GO time (UTC) | |
| Facebook smoke message id (short) | |
| Facebook smoke job id (short) | |
| Facebook recovery message id (short) | |

---

## Instagram window — I-D / I-M / I-R

Execute **only** after **`GO INSTAGRAM DB_ONLY REHEARSAL`** and Facebook window **rolled back** (if Facebook was run). **Not executed in this Agent A session.**

### Instagram window actions I-D1–I-D5

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| I-D1 | **GO time** captured | **`GO INSTAGRAM DB_ONLY REHEARSAL`** + UTC | **NOT RUN** | |
| I-D2 | Instagram runtime → **`DB_ONLY`** | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY`; LINE/FB unchanged | **NOT RUN** | |
| I-D3 | Resolver flag if required | Enable only if architecture requires | **NOT RUN** | |
| I-D4 | Railway worker redeployed | Redeploy confirmed | **NOT RUN** | |
| I-D5 | Worker healthy after redeploy | `/ready` OK | **NOT RUN** | |

### Instagram monitoring I-M1–I-M6

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| I-M1 | Instagram outbound smoke | **SENT**; `external_message_id` present | **NOT RUN** | |
| I-M2 | Queue job | **DONE**; `last_error` empty | **NOT RUN** | |
| I-M3 | Ops Runtime clean | vs baseline | **NOT RUN** | |
| I-M4 | Railway worker logs clean | No errors; no leak | **NOT RUN** | |
| I-M5 | Vercel logs clean | No critical errors | **NOT RUN** | |
| I-M6 | No secret/token/raw payload leak | None observed | **NOT RUN** | |

### Instagram rollback I-R1–I-R8

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| I-R1 | Restore Instagram runtime | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **NOT RUN** | |
| I-R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **NOT RUN** | |
| I-R3 | Redeploy Railway worker | Redeploy confirmed | **NOT RUN** | |
| I-R4 | Worker healthy | `/ready` OK | **NOT RUN** | |
| I-R5 | Post-rollback Instagram recovery smoke | **SENT**; `external_message_id` present | **NOT RUN** | |
| I-R6 | Post-rollback queue job | **DONE**; `last_error` empty | **NOT RUN** | |
| I-R7 | Ops Runtime clean after rollback | No new critical issue | **NOT RUN** | |
| I-R8 | Final Instagram state | **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** | **NOT RUN** | |

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

**HOLD — AWAITING GO FACEBOOK DB_ONLY REHEARSAL / GO INSTAGRAM DB_ONLY REHEARSAL**

- Preflight P1–P8, P13–P20 **PASS** (P13–P16 channel baseline); P9–P12 **NOT RUN**.
- Facebook rehearsal **not executed**. Instagram rehearsal **not executed**.
- **`DB_ONLY` not enabled** by Agent A on Facebook or Instagram.
- Resolver flag **OFF / ABSENT** (P4 **PASS**).
- **`--execute` prohibited**; production-wide / long-running **`DB_ONLY` NOT APPROVED**.

### Final decision options (after execution)

| Outcome | When |
|---------|------|
| **PASS WITH NOTES — Meta `DB_ONLY` rehearsal complete and rolled back** | Both windows succeed (or documented partial with operator approval); F-R8 + I-R8 **PASS** |
| **Facebook only complete** | F window **PASS**; Instagram **NOT RUN** or pending separate **GO** |
| **ROLLED BACK / HOLD** | Stop condition or rollback smoke failed |
| **Production-wide / long-running `DB_ONLY`** | **NOT APPROVED** even if both windows pass |

**If both windows succeed (wording guidance):**

- **PASS WITH NOTES** — Meta **`DB_ONLY` rehearsal complete and rolled back**
- Facebook **`DB_ONLY` proven only for controlled rehearsal** — not long-running production
- Instagram **`DB_ONLY` proven only for controlled rehearsal** — not long-running production
- Production-wide **`DB_ONLY` still NOT APPROVED** until all-channel pilot
- Long-running **`DB_ONLY` still NOT APPROVED**

### Final production state (required after each window)

| Item | Required state |
|------|----------------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (after F rollback) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (after I rollback) |
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
| Facebook / Instagram **`DB_ONLY` enabled** | **No** |
| Resolver flag enabled | **No** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |
