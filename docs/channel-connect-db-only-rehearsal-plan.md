# Channel Connect — Controlled DB_ONLY Rehearsal Plan (CCP-4.0)

**Status:** Planning-only — **`DB_ONLY` not enabled**
**Audience:** SmartKorp HubChat ops / Agent A rollout owners
**Last updated:** 2026-06-06
**Master at plan:** `9de1643` (PR **#185** CCP-3.9 merged)

**Prior assessment:** [`channel-connect-db-only-readiness-assessment.md`](channel-connect-db-only-readiness-assessment.md) — verdict **`DB_ONLY` NOT READY** for long-running production

**Related agent report:** [`docs/agent-reports/agent-a/2026-06-06-ccp-4-0-controlled-db-only-rehearsal-plan.md`](agent-reports/agent-a/2026-06-06-ccp-4-0-controlled-db-only-rehearsal-plan.md)

---

## 1. Purpose

Define a **controlled `DB_ONLY` rehearsal plan** for a **future** operator-run window — **not execution**.

| Item | Detail |
|------|--------|
| **Goal** | Rehearse `DB_ONLY` safely **before** any long-running `DB_ONLY` production decision |
| **This phase (CCP-4.0)** | Documentation and planning only |
| **Execution phase** | **CCP-4.1** complete — **PASS WITH NOTES**. **CCP-4.3** extended pilot evidence: [pilot evidence](agent-reports/agent-a/2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md) — **HOLD** |
| **`DB_ONLY` approval** | **NOT APPROVED** until a later phase explicitly approves long-running cutover |

**Do not enable `DB_ONLY` from this document.** No Railway/Vercel env changes, no redeploys, no smokes, no credential migration **`--execute`**.

---

## 2. Current safe state

| Item | Production state (unchanged by CCP-4.0) |
|------|----------------------------------------|
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** — absent from Railway worker env |
| `DB_ONLY` | **Not enabled / NOT APPROVED** for long-running production |
| Credential migration **`--execute`** | **Not used / prohibited** |
| Long-running resolver flag-on | **NOT APPROVED** |
| Long-running `DB_ONLY` | **NOT APPROVED** |
| CCP-3.9 verdict | **`DB_ONLY` NOT READY** — remain on fallback mode until controlled rehearsal evidence exists |

---

## 3. Preconditions before any future rehearsal

Complete **immediately before** any CCP-4.1 window. All must **PASS** unless noted.

| # | Precondition | Pass criteria | NO-GO if |
|---|--------------|---------------|----------|
| P1 | `master` deployed and healthy | Vercel Production **Ready** on approved commit; Railway worker **active** | Deploy not Ready / worker not active |
| P2 | Worker healthy | `/ready` OK; no restart loop | Worker unhealthy |
| P3 | Channel Settings credentials | LINE / Facebook / Instagram credentials configured in CCP vault (`channel_connections` / metadata) | Missing credentials for scoped channel(s) |
| P4 | Test connection **READY** | Channel Settings **Test connection READY** for LINE, Facebook, Instagram (scoped channels) | Any scoped channel not **READY** |
| P5 | Resolver flag baseline | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** | Unexpected flag state without approval |
| P6 | Runtime mode baseline | **`DB_WITH_ENV_FALLBACK`** on all providers (pre-window) | Unexpected `DB_ONLY` already set |
| P7 | No **`DB_ONLY`** pre-enabled | `HUBCHAT_*_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` before window | `DB_ONLY` already on without approval |
| P8 | Ops Runtime baseline | Capture pending / processing / stale / dead-letter counts from `/dashboard/ops` | Active incident or unexplained queue growth |
| P9 | Historical dead-letter baseline documented | Record known baselines (e.g. inbound DL ≈ 6, outbound queue DL ≈ 26 per CCP-3.8 — verify current at preflight) | Baseline not recorded |
| P10 | Worker logs clean | No unresolved resolver / auth / provider errors | Active worker error storm |
| P11 | Vercel logs clean | No unresolved API/auth errors affecting outbound | Active Vercel incident |
| P12 | Rollback owner assigned | **Chamnan / Operator** | Rollback owner unavailable |
| P13 | Hard stop time defined | Time-boxed window (e.g. 1–2 h) with documented ICT/UTC stop | No hard stop |
| P14 | **`--execute`** | **Not run / prohibited** | Execute attempted |
| P15 | Operator **GO** phrase | Explicit: **`GO CONTROLLED DB_ONLY REHEARSAL`** | GO not received |

### NO-GO gates (do not start window)

- Any **active incident** (worker, Vercel, provider outage)
- **Token / credential issue** or Test connection not **READY**
- **Queue growth** — unexpected pending, stale **PROCESSING**, or dead-letter spike vs baseline
- **Missing rollback owner**
- **GO CONTROLLED DB_ONLY REHEARSAL** not received

---

## 4. Proposed rehearsal scope

### Conservative recommendation — Phase 1: LINE-only

Per-provider runtime env vars exist on Railway worker:

| Variable | Phase 1 rehearsal value |
|----------|-------------------------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_ONLY`** (during window only) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (unchanged) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (unchanged) |

**Rationale:** CCP-3.6 / CCP-3.8 prove LINE resolver path under **`DB_WITH_ENV_FALLBACK`**. Facebook and Instagram were **not actively traffic-tested** in CCP-3.8 (no new outbound traffic). Do **not** treat FB/IG as fully proven for `DB_ONLY`.

### Resolver flag (architecture)

Prior controlled windows required:

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (lowercase `true` only)

During CCP-4.1 rehearsal, plan to enable resolver flag **only for the rehearsal window** if architecture requires DB credential reads — same as CCP-3.6 / CCP-3.8 pattern.

### Blast radius if per-channel scoping fails

If implementation **cannot** scope `DB_ONLY` per channel (all providers flip together):

| Item | Requirement |
|------|-------------|
| Blast radius | **Global** — LINE + Facebook + Instagram lose env fallback simultaneously |
| Approval bar | **Stronger** — explicit multi-channel GO, mandatory FB/IG active smokes if in scope |
| Default | **Defer** rehearsal until LINE-only scoping confirmed |

### Facebook / Instagram during Phase 1

| Option | When |
|--------|------|
| **Exclude active FB/IG smokes** | Default for LINE-only Phase 1 — monitor for regression only |
| **Optional low-risk FB/IG smoke** | Only if separately approved, test accounts ready, and blast radius understood |
| **Do not claim CCP-3.8 proved FB/IG** | CCP-3.8 M6/M7 were **PASS WITH NOTE** due to **no new traffic** |

---

## 5. Exact operator actions (future CCP-4.1 — plan only)

**Not completed in CCP-4.0.** Execute only after **GO CONTROLLED DB_ONLY REHEARSAL** and P1–P15 **PASS**.

| Step | Action |
|------|--------|
| 1 | **Capture start time** (local + UTC) |
| 2 | **Confirm current env state** — `DB_WITH_ENV_FALLBACK`; resolver flag **OFF / ABSENT**; record Railway variable names only |
| 3 | **Set `DB_ONLY` for scoped channel(s)** — Phase 1: `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY` only |
| 4 | **Set resolver flag if required** — `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (if architecture requires) |
| 5 | **Redeploy Railway worker** — confirm deployment success |
| 6 | **Confirm worker healthy** — `/ready` OK |
| 7 | **Controlled LINE outbound smoke** — dedicated test conversation; sanitized evidence capture |
| 8 | **Optional FB/IG smoke** — only if approved in scope (see §4) |
| 9 | **Monitor Ops Runtime** — pending / processing / stale / dead-letter vs baseline |
| 10 | **Monitor Railway worker logs** — resolver, auth, provider; leak scan |
| 11 | **Monitor Vercel logs** — API errors if smokes triggered via UI |
| 12 | **Roll back before hard stop** — see §8 |
| 13 | **Confirm final state** — **`DB_WITH_ENV_FALLBACK`** per provider; resolver flag **OFF / ABSENT** |

**Env change surface:** Railway **worker only** (not Vercel unless separately documented).

---

## 6. SQL smoke queries (read-only)

Run in Supabase SQL editor or read-only client. Replace `<tenant_id>` with production tenant UUID. **Never commit tenant IDs or message content with secrets.**

### Latest LINE outbound messages

```sql
-- Latest LINE OUTBOUND rows (metadata only)
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
-- Latest outbound queue jobs
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

### Suspected Facebook / Instagram failures after window start

```sql
-- Suspected FAILED/ERROR outbound rows after rehearsal start (adjust timestamp)
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

### Queue / outbox health (counts)

```sql
-- queue_jobs by status and topic
select topic, status, count(*) as cnt
from queue_jobs
where tenant_id = '<tenant_id>'
group by topic, status
order by topic, status;

-- Stale PROCESSING queue jobs (threshold ~300s — align with worker reclaim)
select id, topic, status, updated_at,
       extract(epoch from (now() - updated_at)) as seconds_in_processing
from queue_jobs
where tenant_id = '<tenant_id>'
  and status = 'PROCESSING'
  and updated_at < now() - interval '300 seconds'
order by updated_at asc
limit 20;
```

```sql
-- outbox_events by status
select status, count(*) as cnt
from outbox_events
where tenant_id = '<tenant_id>'
group by status
order by status;

-- Stale PROCESSING outbox (threshold ~120s — align with outbox reclaim)
select id, topic, status, updated_at,
       extract(epoch from (now() - updated_at)) as seconds_in_processing
from outbox_events
where tenant_id = '<tenant_id>'
  and status = 'PROCESSING'
  and updated_at < now() - interval '120 seconds'
order by updated_at asc
limit 20;
```

```sql
-- Dead-letter counts (queue + outbox)
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
group by topic
order by source, topic;
```

**Ops Runtime alternative:** `/dashboard/ops` (ADMIN) mirrors these metrics — prefer UI baseline capture when SQL access is limited.

---

## 7. Monitoring checks

During window (map to CCP-4.1 **M** rows):

| Check | Pass criteria |
|-------|---------------|
| Worker healthy after redeploy | `/ready` OK; no restart loop |
| No crash / retry storm | Worker stable; no unbounded error loop |
| No token / secret / raw payload leak | UI, logs, docs, chat — none observed |
| Ops Runtime pending / processing / stale | Stable vs P8 baseline; no new stale **PROCESSING** |
| Queue terminal | `message.outbound.requested` → **DONE** |
| `last_error` | **Empty** on success smoke job |
| `external_message_id` | **Present** on success message row |
| `delivery_status` | **SENT** on success message row |
| Facebook / Instagram | No **unexpected** new FAILED/ERROR rows attributable to window |
| Dead-letter growth | No **unexpected** increase vs P9 baseline |
| Vercel logs | No new critical API/auth errors tied to smokes |
| `configSource` / diagnostics (if logged) | Expect **`DB`** path under `DB_ONLY`; **`ENV_FALLBACK` under `DB_ONLY` is a STOP** |

---

## 8. Rollback plan

Execute at hard stop, on **STOP** condition, or if operator ends window early. Rollback owner: **Chamnan / Operator**.

| # | Step | Expected final state |
|---|------|----------------------|
| R1 | Revert `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` (and any other provider set to `DB_ONLY`) to **`DB_WITH_ENV_FALLBACK`** | No provider on `DB_ONLY` |
| R2 | Remove or disable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| R3 | **Redeploy Railway worker** | Deployment confirmed |
| R4 | **Confirm worker healthy** | `/ready` OK |
| R5 | **Post-rollback LINE recovery smoke** | **SENT**; queue **DONE**; `last_error` empty; `external_message_id` present |
| R6 | **Ops Runtime after rollback** | No new critical issue vs baseline |
| R7 | **Confirm final config state** | All providers **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT** |

**Mandatory end state:** **`DB_WITH_ENV_FALLBACK`** + resolver flag **OFF / ABSENT** — not long-running `DB_ONLY`.

---

## 9. GO / NO-GO gates

### GO (may start CCP-4.1 window)

- P1–P15 **PASS**
- Operator says **`GO CONTROLLED DB_ONLY REHEARSAL`**
- Rollback owner **Chamnan / Operator** available for full window + rollback
- No active incident, token issue, or queue regression

### NO-GO (do not start)

- DB credentials incomplete or Test connection not **READY**
- Active queue / outbox issue (pending backlog, stale **PROCESSING**, unexpected dead-letter growth)
- Token / encryption key issue
- Worker or Vercel unhealthy
- Rollback owner unavailable
- **`GO CONTROLLED DB_ONLY REHEARSAL`** not received

### STOP / immediate rollback

| Condition | Action |
|-----------|--------|
| LINE smoke fails | Rollback R1–R7 |
| Queue not **DONE** | Rollback |
| `last_error` non-empty on success path | Rollback |
| `delivery_status` not **SENT** | Rollback |
| `external_message_id` missing | Rollback |
| Unexpected **`ENV_FALLBACK`** under planned `DB_ONLY` | Rollback + investigate |
| Worker error loop / crash | Rollback |
| Secret / token / raw payload leak | Rollback + SEC incident |
| Ops Runtime regression (stale processing, DL growth) | Rollback |
| Facebook / Instagram unexpected errors attributable to window | Rollback |
| Window exceeds hard stop without separate approval | Rollback |

---

## 10. Evidence template for future CCP-4.1

Use when executing **CCP-4.1 Controlled DB_ONLY Rehearsal Execution** (separate docs PR). Sanitized metadata only — no secrets.

### Preflight P1–P15

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| P1 | … P15 | PASS / FAIL / N/A | |

### DB_ONLY window D1–D8

| # | Step | Result | Evidence |
|---|------|--------|----------|
| D1 | Start time captured | | |
| D2 | Pre-window env confirmed | | |
| D3 | `DB_ONLY` set (scoped) | | |
| D4 | Resolver flag set (if required) | | |
| D5 | Worker redeployed | | |
| D6 | Worker healthy | | |
| D7 | LINE outbound smoke | | Message id prefix; `delivery_status`; job id prefix |
| D8 | Optional FB/IG smoke | N/A / PASS / FAIL | |

### Monitoring M1–M10

| # | Check | Result | Notes |
|---|--------|--------|-------|
| M1 | Worker healthy after redeploy | | |
| M2 | LINE outbound **SENT** / queue **DONE** | | |
| M3 | Ops Runtime | | |
| M4 | Worker logs clean | | |
| M5 | Vercel logs | | |
| M6 | Facebook no regression | | Note if no traffic |
| M7 | Instagram no regression | | Note if no traffic |
| M8 | No secret leak | | |
| M9 | `configSource` / diagnostics | | |
| M10 | Hard stop met | | |

### Rollback R1–R7

| # | Step | Result | Evidence |
|---|------|--------|----------|
| R1 | Revert `DB_ONLY` | | |
| R2 | Resolver flag **OFF / ABSENT** | | |
| R3 | Worker redeploy | | |
| R4 | Worker healthy | | |
| R5 | LINE recovery smoke | | |
| R6 | Ops Runtime clean | | |
| R7 | Final **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT** | | |

### Final decision

| Field | Value |
|-------|--------|
| CCP-4.1 result | PASS / PASS WITH NOTES / ROLLED BACK / HOLD |
| Long-running `DB_ONLY` approved? | **No** unless separate future phase |
| Final runtime modes | |
| Final resolver flag | **OFF / ABSENT** (required) |

---

## 11. Recommendation

| Item | CCP-4.0 decision |
|------|------------------|
| **Execute `DB_ONLY` rehearsal now** | **NO** — CCP-4.0 does **not** approve execution |
| **Enable `DB_ONLY` in production** | **NOT APPROVED** |
| **Long-running `DB_ONLY`** | **NOT APPROVED** |
| **Production mode until CCP-4.1+** | Remain on **`DB_WITH_ENV_FALLBACK`** |
| **Resolver flag** | Remain **OFF / ABSENT** |
| **`--execute`** | **Prohibited** |
| **Recommended next step** | Operator review of this plan → **CCP-4.1 Controlled DB_ONLY Rehearsal Execution** (only after **`GO CONTROLLED DB_ONLY REHEARSAL`**) |

---

## Guardrails (unchanged)

- **CCP-4.0:** planning-only; no production config changes
- **`DB_ONLY`:** not enabled
- **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`:** not enabled
- **Long-running flag-on / long-running `DB_ONLY`:** not approved

---

## Related docs

| Document | Use |
|----------|-----|
| [DB_ONLY readiness assessment](channel-connect-db-only-readiness-assessment.md) | CCP-3.9 verdict |
| [Outbound rollout readiness](channel-connect-outbound-rollout-readiness.md) | CCP-3.1 env inventory |
| [CCP-3.8 execution](agent-reports/agent-a/2026-06-06-ccp-3-8-line-resolver-extended-monitoring-execution-evidence.md) | Latest controlled window |
| [Worker queue observability](hubchat-worker-queue-observability-runbook.md) | Ops Runtime baselines |
