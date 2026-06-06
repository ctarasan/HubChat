# CCP-4.3 — LINE-only DB_ONLY Extended Pilot Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** Preflight **complete** — **HOLD — AWAITING GO LINE DB_ONLY EXTENDED PILOT** (pilot not executed)
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

| Guardrail | Status (CCP-4.3 Agent A session) |
|-----------|----------------------------------|
| Agent A enabled LINE **`DB_ONLY`** | **No** |
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** |
| Operator said **GO LINE DB_ONLY EXTENDED PILOT** | **No** |
| Production env changes | **None** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| **`--execute`** | **Not run / prohibited** |
| Secrets/tokens/raw payloads in this doc | **None** |

---

## Current production state (pre-pilot)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (P3 **PASS**) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` / `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (unchanged) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (P4 **PASS**) |
| LINE **`DB_ONLY` currently enabled | **No** (P5 **PASS**) |
| CCP-4.3 extended pilot executed | **No** |

---

## Preflight checklist P1–P18

Complete **immediately before** pilot enable. **CCP-4.3 Agent A session:** repo/safe-state items **PASS**; operator live checks **NOT RUN** until pre-window verification.

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `4e3773e` — `git pull --ff-only` clean |
| P2 | PR **#188** (CCP-4.2) included in `master` | Merge commit on `master` | **PASS** | PR **#188** merged |
| P3 | Production currently **`DB_WITH_ENV_FALLBACK`** | LINE / FB / IG on fallback mode | **PASS** | Documented safe state; Agent A did **not** change modes |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` absent from Railway worker | **PASS** | Flag **OFF / ABSENT** |
| P5 | **`DB_ONLY` not currently enabled** | No provider on `DB_ONLY` before pilot | **PASS** | **`DB_ONLY` not enabled** |
| P6 | Facebook / Instagram **`DB_ONLY` not approved** | FB/IG remain **`DB_WITH_ENV_FALLBACK`**; no FB/IG `DB_ONLY` in scope | **PASS** | **NOT APPROVED** per CCP-4.2 |
| P7 | **`--execute` not used / prohibited** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P8 | Railway worker healthy | `/ready` OK; no restart loop | **NOT RUN** | Awaiting operator pre-pilot verify |
| P9 | Vercel app/API healthy | Production **Ready**; API acceptable | **NOT RUN** | Awaiting operator pre-pilot verify |
| P10 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter from `/dashboard/ops` | **NOT RUN** | Awaiting operator baseline capture |
| P11 | Historical dead-letter baseline documented | Record current baselines (verify vs prior: inbound DL ≈ 6, outbound queue DL ≈ 26) | **NOT RUN** | Awaiting operator baseline capture |
| P12 | LINE Channel Settings / Test connection **READY** | LINE **READY** for pilot | **NOT RUN** | Awaiting operator verify |
| P13 | LINE DB credentials present | CCP vault metadata ready for LINE **`DB_ONLY`** | **NOT RUN** | Awaiting operator verify (metadata only) |
| P14 | Rollback owner assigned | Owner available for full pilot + rollback | **PASS** | **Chamnan / Operator** |
| P15 | Pilot duration | **30 minutes** selected by operator | **PASS** | Duration: **30 minutes** |
| P16 | Hard stop defined | **30 minutes after flag-on** / env enable | **PASS** | Hard stop: **T+30 min** from enable |
| P17 | **GO** phrase required | **`GO LINE DB_ONLY EXTENDED PILOT`** before execution | **PASS** | Phrase documented; **not received** |
| P18 | Decision before flag-on | **HOLD — AWAITING GO LINE DB_ONLY EXTENDED PILOT** | **HOLD** | Operator **GO** **not received** |

**Preflight gate for execution:** P1–P17 operator-applicable items **PASS** + operator **`GO LINE DB_ONLY EXTENDED PILOT`** → may begin D1–D5.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.2 next candidate | **CCP-4.3 LINE-only Extended Pilot** — **APPROVE NEXT STEP ONLY** |
| Agent A repo preflight P1–P7, P14–P17 | **PASS** |
| Operator live preflight P8–P13 | **NOT RUN** — verify before **GO** |
| Operator command **GO LINE DB_ONLY EXTENDED PILOT** | **Not received** |
| LINE **`DB_ONLY` enable authorized** | **No** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — monitor only |

**Do not enable LINE `DB_ONLY` or resolver flag until operator explicitly says: `GO LINE DB_ONLY EXTENDED PILOT`**

---

## Window actions D1–D5

Execute **only** after **GO LINE DB_ONLY EXTENDED PILOT** and preflight **PASS**. **Not executed in this Agent A session.**

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| D1 | **GO time** captured | Local + UTC recorded | **NOT RUN** | Start hard-stop clock (**T+30 min**) |
| D2 | LINE runtime mode → **`DB_ONLY`** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY`; FB/IG unchanged | **NOT RUN** | LINE-only scope |
| D3 | Resolver flag if required | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` only if architecture requires | **NOT RUN** | Roll back **OFF / ABSENT** at R2 |
| D4 | Railway worker redeployed | Redeploy confirmed | **NOT RUN** | |
| D5 | Worker healthy after redeploy | `/ready` OK | **NOT RUN** | |

| Field | Placeholder |
|-------|-------------|
| GO time (local / UTC) | |
| Hard stop (T+30 min local / UTC) | |
| Exact env changes (names only) | |

---

## Monitoring checks M1–M10

During **30-minute** pilot only. **Not executed in this Agent A session.**

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | Initial LINE outbound smoke | **SENT**; `external_message_id` present | **NOT RUN** | Message id prefix: _____ |
| M2 | Initial queue job | **DONE**; `last_error` empty | **NOT RUN** | Job id prefix: _____ |
| M3 | Ops Runtime clean at **start** | vs P10/P11 baseline | **NOT RUN** | Closes CCP-4.1 M3 gap |
| M4 | Railway worker logs clean at **start** | No resolver/auth/provider errors; no leak | **NOT RUN** | Closes CCP-4.1 M4 gap |
| M5 | Vercel logs clean at **start** | No critical API/auth errors | **NOT RUN** | Closes CCP-4.1 M5 gap |
| M6 | No secret/token/raw payload leak at **start** | None in UI, logs, docs, chat | **NOT RUN** | Closes CCP-4.1 M6 gap |
| M7 | **Mid-window (~15 min)** | Ops + logs clean | **NOT RUN** | Periodic check |
| M8 | **Final-window (~30 min)** | Ops + logs clean; hard stop met | **NOT RUN** | Before rollback |
| M9 | **Facebook** monitoring | No regression **or not included** | **NOT RUN** | **NOT APPROVED** for FB **`DB_ONLY`**; monitor only |
| M10 | **Instagram** monitoring | No regression **or not included** | **NOT RUN** | **NOT APPROVED** for IG **`DB_ONLY`**; monitor only |

---

## Rollback checks R1–R8

Execute at **T+30 min** hard stop, on STOP condition, or operator stop.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Restore LINE runtime mode | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **NOT RUN** | |
| R2 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **NOT RUN** | |
| R3 | Redeploy Railway worker | Redeploy confirmed | **NOT RUN** | |
| R4 | Worker healthy after rollback | `/ready` OK | **NOT RUN** | |
| R5 | Post-rollback LINE recovery smoke | **SENT**; `external_message_id` present | **NOT RUN** | Message id prefix: _____ |
| R6 | Post-rollback queue job | **DONE**; `last_error` empty | **NOT RUN** | Job id prefix: _____ |
| R7 | Ops Runtime clean after rollback | No new critical issue vs baseline | **NOT RUN** | |
| R8 | Final config state confirmed | **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** | **NOT RUN** | |

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

**HOLD — AWAITING GO LINE DB_ONLY EXTENDED PILOT**

- Agent A repo preflight P1–P7, P14–P17 **PASS**; P18 **HOLD**.
- Operator live checks P8–P13 **NOT RUN**.
- Extended pilot **not executed**. LINE **`DB_ONLY` not enabled** by Agent A.
- Resolver flag **not enabled** by Agent A — **OFF / ABSENT** (P4 **PASS**).
- Pilot duration **30 minutes**; hard stop **T+30 min** from enable (P15–P16 **PASS**).
- **`--execute` prohibited**; long-running / production-wide / FB/IG **`DB_ONLY` NOT APPROVED**.
- Operator must say **GO LINE DB_ONLY EXTENDED PILOT** before D1–D5.

### Final decision options (after execution)

| Outcome | When |
|---------|------|
| **PASS WITH NOTES — 30-MINUTE LINE `DB_ONLY` EXTENDED PILOT COMPLETE** | D/M **PASS**; R1–R8 **PASS**; final **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT** |
| **ROLLED BACK / HOLD** | Stop condition or rollback smoke failed |
| **Long-running `DB_ONLY`** | **NOT APPROVED** even if pilot passes |
| **Production-wide / FB/IG `DB_ONLY`** | **NOT APPROVED** |

### Final production state (required after pilot)

| Item | Required state |
|------|----------------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
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
| LINE **`DB_ONLY` enabled** | **No** |
| Resolver flag enabled | **No** |
| Secrets in doc | **No** |
| `git diff --check` | **PASS** (pre-PR) |
| Hidden/bidi scan | **PASS** (pre-PR) |
| npm test/build | **Skipped** (docs-only) |
