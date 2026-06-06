# CCP-4.3 — LINE-only DB_ONLY Extended Pilot Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** LINE-only **`DB_ONLY` Extended Pilot COMPLETE** — rolled back to **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT**
**Result:** **PASS WITH NOTES**
**PR:** [#189](https://github.com/ctarasan/HubChat/pull/189)
**Master at capture:** `4e3773e` (PR **#188** CCP-4.2 merged)
**Operator:** Chamnan / Operator — sanitized report to Agent A; no secrets in artifact
**Prior:** [CCP-4.2 decision](../../channel-connect-db-only-rollout-decision.md) · [CCP-4.1 execution](./2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md) · [CCP-4.0 plan](../../channel-connect-db-only-rehearsal-plan.md)

---

## Goal

Prepare execution evidence for a **30-minute LINE-only `DB_ONLY` extended pilot** to close CCP-4.1 Ops/log/leak gaps (M3–M6). Record preflight, window actions, monitoring, rollback, and final decision — **without** enabling `DB_ONLY` until operator explicitly says **`GO LINE DB_ONLY EXTENDED PILOT`**.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Preflight P1–P18 | Long-running **`DB_ONLY`** |
| Window D1–D5 (after GO) | Production-wide **`DB_ONLY`** |
| Monitoring M1–M10 (after GO) | Facebook / Instagram **`DB_ONLY`** |
| Rollback R1–R8 (after GO) | Credential migration **`--execute`** |
| 30-minute pilot duration | Product / worker / API changes |
| LINE-only `DB_ONLY` | Marketplace channels |

**Pilot duration:** **30 minutes** hard stop from flag-on / env enable. **Final required state:** **`DB_WITH_ENV_FALLBACK`** + resolver flag **OFF / ABSENT**.

**This phase proves only a 30-minute LINE-only extended pilot if completed — not long-running, production-wide, or FB/IG `DB_ONLY`.**

---

## Guardrails

| Guardrail | Status (CCP-4.3) |
|-----------|------------------|
| Agent A enabled LINE **`DB_ONLY`** | **No** — operator only during approved pilot |
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** — remained **OFF / ABSENT** (D3 **NOT REQUIRED**) |
| Operator said **GO LINE DB_ONLY EXTENDED PILOT** | **Yes** — pilot executed |
| Scope | **LINE-only `DB_ONLY`** — FB/IG **`DB_ONLY` NOT APPROVED / NOT INCLUDED** |
| Production env changes | **Operator only** (pilot window + rollback) |
| `DB_ONLY` left running | **No** — rolled back |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — not included |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| **`--execute`** | **Not run / prohibited** |
| Product / runtime code changes | **None** |
| Secrets/tokens/raw payloads in this doc | **None** (partial row/job IDs; credential labels only) |

---

## Current production state (post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (R1 **PASS**) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` / `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (unchanged; FB/IG **`DB_ONLY` not included**) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (R2 **PASS**) |
| LINE **`DB_ONLY` left running | **No** — rolled back (R8 **PASS**) |
| CCP-4.3 extended pilot executed | **Yes** — **30-minute** LINE-only; **rolled back** |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

---

## Preflight checklist P1–P18

Complete **immediately before** pilot enable. **CCP-4.3 operator verification:** P1–P18 **PASS** (P11 **PASS WITH NOTE**).

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `4e3773e` — `git pull --ff-only` clean |
| P2 | PR **#188** (CCP-4.2) included in `master` | Merge commit on `master` | **PASS** | PR **#188** merged |
| P3 | Production currently **`DB_WITH_ENV_FALLBACK`** | LINE / FB / IG on fallback mode | **PASS** | Documented safe state |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` absent from Railway worker | **PASS** | Flag **OFF / ABSENT** |
| P5 | **`DB_ONLY` not currently enabled** | No provider on `DB_ONLY` before pilot | **PASS** | **`DB_ONLY` not enabled** pre-pilot |
| P6 | Facebook / Instagram **`DB_ONLY` not approved** | FB/IG remain **`DB_WITH_ENV_FALLBACK`**; no FB/IG `DB_ONLY` in scope | **PASS** | **NOT APPROVED** / **NOT INCLUDED** |
| P7 | **`--execute` not used / prohibited** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P8 | Railway worker healthy | `/ready` OK; no restart loop | **PASS** | Health confirmed before pilot |
| P9 | Vercel app/API healthy | Production **Ready**; API acceptable | **PASS** | Vercel/API healthy before pilot |
| P10 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter from `/dashboard/ops` | **PASS** | Queue pending depth **0**; queue lag **0 ms**; outbox pending depth **0**; outbox lag **0 ms**; inbound queue pending/processing/stale **0**; outbound queue pending/processing/stale **0**; outbox pending/processing/stale/dead-letter **0** |
| P11 | Historical dead-letter baseline documented | Record current baselines | **PASS WITH NOTE** | Inbound queue dead letter **6**; outbound queue dead letter **26** — **historical baseline only**, not active outage |
| P12 | LINE Channel Settings / Test connection **READY** | LINE **READY** for pilot | **PASS** | LINE configured **Yes**; status **READY**; last error **None recorded** |
| P13 | LINE DB credentials present | CCP vault metadata ready for LINE **`DB_ONLY`** | **PASS** | Channel secret **SET**; channel access token **SET** — secret values **not viewed or exposed** |
| P14 | Rollback owner assigned | Owner available for full pilot + rollback | **PASS** | **Chamnan / Operator** |
| P15 | Pilot duration | **30 minutes** selected by operator | **PASS** | Duration: **30 minutes** |
| P16 | Hard stop defined | **30 minutes after env enable** | **PASS** | Hard stop: **T+30 min** from enable |
| P17 | **GO** phrase required | **`GO LINE DB_ONLY EXTENDED PILOT`** before execution | **PASS** | **`GO LINE DB_ONLY EXTENDED PILOT`** received |
| P18 | Decision before enable | Operator **GO** received | **PASS** | Pilot authorized |

**Preflight gate for execution:** P1–P17 operator-applicable items **PASS** + operator **`GO LINE DB_ONLY EXTENDED PILOT`** → may begin D1–D5.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.2 next candidate | **CCP-4.3 LINE-only Extended Pilot** — **APPROVE NEXT STEP ONLY** |
| Agent A repo preflight P1–P7, P14–P17 | **PASS** |
| Operator live preflight P8–P13 | **PASS** (P11 **PASS WITH NOTE**) |
| Operator command **GO LINE DB_ONLY EXTENDED PILOT** | **Received** |
| Pilot executed | **Yes** — rolled back |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — **NOT INCLUDED** |

---

## Window actions D1–D5

Executed after **GO LINE DB_ONLY EXTENDED PILOT** and preflight **PASS**. Operator-run; sanitized evidence recorded by Agent A.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| D1 | **GO time** captured | **`GO LINE DB_ONLY EXTENDED PILOT`** recorded | **PASS** | Operator phrase: **`GO LINE DB_ONLY EXTENDED PILOT`** |
| D2 | LINE runtime mode → **`DB_ONLY`** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY`; FB/IG unchanged | **PASS** | Pilot LINE outbound smoke succeeded while LINE **`DB_ONLY`** window active (M1) |
| D3 | Resolver flag if required | Enable only if architecture requires | **NOT REQUIRED** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **absent** from Railway; pilot proceeded using LINE runtime mode only |
| D4 | Railway worker redeployed | Redeploy confirmed | **PASS WITH NOTE** | Successful **`DB_ONLY`** smoke after env change; explicit redeploy artifact not separately cited |
| D5 | Worker healthy after redeploy | `/ready` OK | **PASS WITH NOTE** | Successful LINE outbound smoke (M1); explicit health check artifact not separately cited |

| Field | Value |
|-------|--------|
| Pilot LINE smoke (UTC) | `2026-06-06 09:57:32+00` |
| Rollback recovery smoke (UTC) | `2026-06-06 10:41:19+00` |
| Pilot duration | **30 minutes** |
| Scope | LINE **`DB_ONLY`** only; FB/IG **`DB_WITH_ENV_FALLBACK`** |

---

## Monitoring checks M1–M10

During **30-minute** LINE-only pilot. Operator-run; sanitized evidence recorded by Agent A.

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | Initial LINE outbound smoke | **SENT**; `external_message_id` present | **PASS** | Message `93e0f2fb`; **OUTBOUND**; `channel_type` **LINE**; `created_at` `2026-06-06 09:57:32+00`; `external_message_id_present` = true; `metadata_json` has `sent_at` / `delivery_status` **SENT** |
| M2 | Initial queue job | **DONE**; `last_error` empty | **PASS** | Job `cdbe6a8`; `created_at` `2026-06-06 09:57:32+00`; **DONE**; `last_error_empty` = true |
| M3 | Ops Runtime clean at **start** (after enable) | vs P10/P11 baseline | **NOT CAPTURED** | No separate after-enable Ops snapshot in operator report |
| M4 | Railway worker logs clean at **start** | No errors; no leak | **NOT CAPTURED** | No log review artifact in operator report |
| M5 | Vercel logs clean at **start** | No critical API/auth errors | **NOT CAPTURED** | No Vercel log artifact in operator report |
| M6 | No secret/token/raw payload leak at **start** | None observed | **NOT CAPTURED** | No explicit leak scan artifact in operator report |
| M7 | **Mid-window (~15 min)** | Ops + logs clean | **NOT CAPTURED** | No midpoint evidence in operator report |
| M8 | **Final-window (~30 min)** | Ops + logs clean; hard stop met | **NOT CAPTURED** | No final-window Ops/log artifact in operator report |
| M9 | **Facebook** monitoring | No regression **or not included** | **PASS WITH NOTE** | Facebook **`DB_ONLY` NOT APPROVED** and **NOT INCLUDED** in this LINE-only pilot |
| M10 | **Instagram** monitoring | No regression **or not included** | **PASS WITH NOTE** | Instagram **`DB_ONLY` NOT APPROVED** and **NOT INCLUDED** in this LINE-only pilot |

---

## Rollback checks R1–R8

Execute at **T+30 min** hard stop, on STOP condition, or operator stop.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Restore LINE runtime mode | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | Operator confirmed Railway worker env: **`DB_WITH_ENV_FALLBACK`** |
| R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |
| R3 | Redeploy Railway worker | Redeploy confirmed | **PASS** | Operator reported rollback done and worker redeployed |
| R4 | Worker healthy after rollback | `/ready` OK | **PASS** | Operator reported outbound LINE test passed after rollback |
| R5 | Post-rollback LINE recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `5ef3b155`; **OUTBOUND**; `channel_type` **LINE**; `created_at` `2026-06-06 10:41:19+00`; `external_message_id_present` = true |
| R6 | Post-rollback queue job | **DONE**; `last_error` empty | **PASS** | Job `07a82c26`; `created_at` `2026-06-06 10:41:19+00`; **DONE**; `last_error_empty` = true |
| R7 | Ops Runtime clean after rollback | No new critical issue vs baseline | **PASS** | Operator confirmed R7 **PASS** |
| R8 | Final config state confirmed | **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** | **PASS** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK`; `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |

---

## SQL smoke queries (read-only)

Replace `<tenant_id>` with production tenant UUID. **Never commit secrets or full message content.**

### Latest LINE outbound messages

```sql
select
  id,
  created_at,
  direction,
  channel_type,
  (external_message_id is not null) as external_message_id_present,
  metadata_json->>'delivery_status' as delivery_status
from messages
where tenant_id = '<tenant_id>'
  and channel_type = 'LINE'
  and direction = 'OUTBOUND'
order by created_at desc
limit 10;
```

### Latest `message.outbound.requested` queue jobs

```sql
select
  id,
  created_at,
  updated_at,
  topic,
  status,
  (last_error is null or last_error = '') as last_error_empty,
  left(last_error, 200) as last_error_prefix
from queue_jobs
where tenant_id = '<tenant_id>'
  and topic = 'message.outbound.requested'
order by created_at desc
limit 10;
```

### Suspected Facebook / Instagram failures after pilot start

```sql
select
  id,
  created_at,
  channel_type,
  direction,
  metadata_json->>'delivery_status' as delivery_status,
  left(metadata_json->>'error', 200) as error_prefix
from messages
where tenant_id = '<tenant_id>'
  and channel_type in ('FACEBOOK', 'INSTAGRAM')
  and direction = 'OUTBOUND'
  and created_at >= timestamptz 'YYYY-MM-DD HH:MI:SS+00'
  and (
    metadata_json->>'delivery_status' in ('FAILED', 'ERROR')
    or metadata_json ? 'error'
  )
order by created_at desc
limit 20;
```

### Queue / outbox stale and dead-letter (baseline)

```sql
-- queue_jobs by status
select topic, status, count(*) as cnt
from queue_jobs
where tenant_id = '<tenant_id>'
group by topic, status
order by topic, status;

-- Stale PROCESSING queue jobs (~300s threshold)
select id, topic, status, updated_at
from queue_jobs
where tenant_id = '<tenant_id>'
  and status = 'PROCESSING'
  and updated_at < now() - interval '300 seconds'
limit 20;

-- outbox_events by status
select status, count(*) as cnt
from outbox_events
where tenant_id = '<tenant_id>'
group by status;

-- Dead-letter counts
select 'queue_jobs' as source, topic, count(*) as dead_letter_cnt
from queue_jobs
where tenant_id = '<tenant_id>'
  and status = 'DEAD_LETTER'
group by topic
union all
select 'outbox_events' as source, topic, count(*) as dead_letter_cnt
from outbox_events
where tenant_id = '<tenant_id>'
  and status = 'DEAD_LETTER'
group by topic;
```

**Ops Runtime alternative:** `/dashboard/ops` (ADMIN) — see [`hubchat-worker-queue-observability-runbook.md`](../../hubchat-worker-queue-observability-runbook.md).

**Known historical baseline (verify at P11):** inbound queue dead letter ≈ **6**; outbound queue dead letter ≈ **26** (CCP-3.8 reference — confirm current at preflight).

---

## Stop conditions (immediate rollback)

| Condition | Action |
|-----------|--------|
| LINE smoke fails | Rollback R1–R8 |
| Queue not **DONE** | Rollback |
| `last_error` non-empty on success path | Rollback |
| `delivery_status` not **SENT** | Rollback |
| Unexpected **`ENV_FALLBACK`** under planned LINE **`DB_ONLY`** | Rollback + investigate |
| Worker crash / restart loop | Rollback |
| Ops Runtime regression | Rollback |
| Secret / token / raw payload leak | Rollback + SEC incident |
| Facebook / Instagram unexpected errors attributable to pilot | Rollback |
| Window exceeds **30 minutes** without separate approval | Rollback |

---

## Final decision (CCP-4.3)

**PASS WITH NOTES — 30-MINUTE LINE-ONLY `DB_ONLY` EXTENDED PILOT COMPLETE**

| Item | State |
|------|--------|
| CCP-4.3 extended pilot | **COMPLETE** |
| Result | **PASS WITH NOTES** |
| LINE **`DB_ONLY` pilot smoke** | **PASS** — **SENT** / queue **DONE** |
| Rollback | **PASS** — R1–R8 |
| Final production state | **`DB_WITH_ENV_FALLBACK`** + resolver flag **OFF / ABSENT** |
| `DB_ONLY` left running | **No** |
| **`--execute`** | **Not used / prohibited** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — **NOT INCLUDED** |
| Product / runtime code changes | **None** |
| Rollback owner | **Chamnan / Operator** |

**Notes (PASS WITH NOTES rationale):**

- M3–M8 **NOT CAPTURED** — no after-enable Ops snapshot, log review, leak scan, or mid/final-window checks in operator report (preflight P10 baseline **PASS**; post-rollback R7 **PASS**).
- M9 / M10 **PASS WITH NOTE** — Facebook and Instagram **`DB_ONLY` NOT APPROVED** and **NOT INCLUDED**; do **not** infer FB/IG **`DB_ONLY`** proof.
- D3: Resolver flag **NOT REQUIRED** — pilot used LINE runtime mode only with flag **OFF / ABSENT**.
- D4 / D5 **PASS WITH NOTE** — inferred from successful smoke; explicit redeploy/health artifacts not separately cited.

**This pilot proves a controlled 30-minute LINE-only `DB_ONLY` smoke + rollback — not long-running, production-wide, or FB/IG `DB_ONLY` readiness.**

**Not approved / not recommended:**

- Long-running **`DB_ONLY`** — **NOT APPROVED**
- Production-wide **`DB_ONLY`** — **NOT APPROVED**
- Facebook / Instagram **`DB_ONLY`** — **NOT APPROVED**
- Broad **`DB_ONLY` rollout** — **not recommended** from CCP-4.3 alone

### Final production state (confirmed post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` | **Not running** |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-4.2 rollout decision](../../channel-connect-db-only-rollout-decision.md) | Approved next step |
| [CCP-4.1 execution](./2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md) | Prior rehearsal; M3–M6 gaps |
| [CCP-4.0 rehearsal plan](../../channel-connect-db-only-rehearsal-plan.md) | SQL / rollback patterns |
| [Worker queue observability](../../hubchat-worker-queue-observability-runbook.md) | Ops baselines |

---

## Verification (CCP-4.3 docs-only)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| LINE **`DB_ONLY` enabled (final state)** | **No** — rolled back |
| Resolver flag (final state) | **OFF / ABSENT** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |
