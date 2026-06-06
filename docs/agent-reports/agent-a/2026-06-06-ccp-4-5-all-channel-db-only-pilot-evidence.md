# CCP-4.5 — All-channel DB_ONLY Pilot Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** All-channel **`DB_ONLY` Pilot** — preflight + execution evidence artifact (**HOLD**)
**Result:** **HOLD — AWAITING GO ALL-CHANNEL DB_ONLY PILOT**
**PR:** [#191](https://github.com/ctarasan/HubChat/pull/191)
**Master at capture:** `2048d64` (PR **#189** CCP-4.3 merged; PR **#190** CCP-4.4 per operator sync)
**Operator:** Chamnan / Operator — sanitized report to Agent A; no secrets in artifact
**Prior:** [CCP-4.4 Meta rehearsal](./2026-06-06-ccp-4-4-meta-db-only-rehearsal-evidence.md) · [CCP-4.3 LINE pilot](./2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md) · [CCP-4.2 decision](../../channel-connect-db-only-rollout-decision.md) · [CCP-4.0 plan](../../channel-connect-db-only-rehearsal-plan.md)

---

## Goal

Prepare execution evidence for a **controlled 30-minute all-channel `DB_ONLY` pilot** where **LINE, Facebook, and Instagram** are temporarily set to **`DB_ONLY` together**, then **mandatorily rolled back**.

Record preflight, window actions, monitoring, rollback, and final decision — **without** enabling all-channel **`DB_ONLY`** until operator explicitly says:

**`GO ALL-CHANNEL DB_ONLY PILOT`**

**This artifact does not approve long-running or production-wide permanent `DB_ONLY`.** Controlled pilot success (if completed) does **not** mean Meta or all-channel **`DB_ONLY` is permanently safe.**

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Preflight P1–P20 | Long-running **`DB_ONLY`** |
| Window D1–D7 (after GO) | Production-wide **permanent** **`DB_ONLY`** |
| Monitoring M1–M14 (after GO) | Credential migration **`--execute`** |
| Rollback R1–R12 (after GO) | Product / worker / API changes |
| **30-minute** time-boxed pilot | Marketplace channels |
| LINE + Facebook + Instagram **`DB_ONLY` together** | Separate per-channel windows (CCP-4.4 pattern) |

**Pilot duration:** **30 minutes** hard stop from all-channel enable. **Final required state:** LINE / Facebook / Instagram **`DB_WITH_ENV_FALLBACK`**; resolver flag **OFF / ABSENT**.

**This phase proves only a controlled all-channel pilot if completed — not long-running or production-wide `DB_ONLY` approval.**

---

## Guardrails

| Guardrail | Status (CCP-4.5 preflight) |
|-----------|----------------------------|
| Agent A enabled all-channel **`DB_ONLY`** | **No** — operator only during approved pilot |
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** — remains **OFF / ABSENT** unless architecture requires (D5) |
| Operator said **GO ALL-CHANNEL DB_ONLY PILOT** | **No** — **HOLD** |
| Scope | **LINE + Facebook + Instagram `DB_ONLY` together** — time-boxed |
| Production env changes | **Operator only** (pilot window + mandatory rollback) |
| `DB_ONLY` left running | **No** (required post-pilot) — not enabled yet |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** until **CCP-4.6** final decision (separate review) |
| **`--execute`** | **Not run / prohibited** |
| Product / runtime code changes | **None** |
| Secrets/tokens/raw payloads in this doc | **None** (partial row/job IDs; credential labels only) |

---

## Current production state (pre-pilot — safe baseline)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| All-channel **`DB_ONLY`** | **Not enabled** |
| Prior controlled rehearsals | CCP-4.1 / CCP-4.3 (LINE); CCP-4.4 (FB + IG separate) — all rolled back |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

### Channel Settings baseline (from prior phases — verify at P13–P15)

| Channel | Configured | Status | Last error | Credentials (labels only) |
|---------|------------|--------|------------|---------------------------|
| **LINE** | **Yes** | **READY** | **None recorded** | Channel secret **SET**; channel access token **SET** — values **not exposed** |
| **Facebook** | **Yes** | **READY** | **None recorded** | Page access token **SET**; app secret **SET** — values **not exposed** |
| **Instagram** | **Yes** | **READY** | **None recorded** | Access token **SET**; verify token **SET** — values **not exposed** |

---

## Preflight checklist P1–P20

Complete **immediately before** all-channel pilot enable. **Agent A repo verification (2026-06-06):** P1–P8, P13–P20 **PASS**; P9–P12 **NOT RUN** (operator live checks before GO).

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `2048d64` — `git pull --ff-only` clean |
| P2 | PR **#190** (CCP-4.4) included in `master` | Merge commit on `master` | **PASS** | Operator confirmed master synced; CCP-4.4 Meta rehearsal merged |
| P3 | Production mode **`DB_WITH_ENV_FALLBACK`** | LINE / FB / IG on fallback | **PASS** | Documented safe state (P3) |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` absent from Railway worker | **PASS** | Flag **OFF / ABSENT** |
| P5 | LINE **`DB_ONLY` not currently enabled** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-pilot baseline |
| P6 | Facebook **`DB_ONLY` not currently enabled** | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-pilot baseline |
| P7 | Instagram **`DB_ONLY` not currently enabled** | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-pilot baseline |
| P8 | **`--execute` not used / prohibited** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P9 | Railway worker healthy | `/ready` OK; no restart loop | **NOT RUN** | Operator verify immediately before GO |
| P10 | Vercel app/API healthy | Production **Ready**; API acceptable | **NOT RUN** | Operator verify immediately before GO |
| P11 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter from `/dashboard/ops` | **NOT RUN** | Operator capture before GO |
| P12 | Historical dead-letter baseline documented | Record current baselines | **NOT RUN** | Known reference: inbound queue DL **6**; outbound queue DL **26** — verify current at P12 |
| P13 | LINE Channel Settings / Test connection **READY** | LINE **READY** for pilot | **PASS** | CCP-4.3 baseline; re-verify at GO |
| P14 | Facebook Channel Settings / Test connection **READY** | Facebook **READY** | **PASS** | CCP-4.4 baseline; re-verify at GO |
| P15 | Instagram Channel Settings / Test connection **READY** | Instagram **READY** | **PASS** | CCP-4.4 baseline; re-verify at GO |
| P16 | Rollback owner assigned | Owner available for full pilot + rollback | **PASS** | **Chamnan / Operator** |
| P17 | Pilot duration selected | **30 minutes** recommended | **PASS** | Duration: **30 minutes** |
| P18 | Hard stop defined | **30 minutes after all-channel enable** | **PASS** | Hard stop: **T+30 min** from enable |
| P19 | **GO** phrase required | **`GO ALL-CHANNEL DB_ONLY PILOT`** before execution | **PASS** | Phrase documented; **not yet received** |
| P20 | Decision before execution | **HOLD — AWAITING GO ALL-CHANNEL DB_ONLY PILOT** | **PASS** | Pilot **not authorized** until operator GO |

**Preflight gate for execution:** P1–P20 operator-applicable items **PASS** + operator **`GO ALL-CHANNEL DB_ONLY PILOT`** → may begin D1–D7.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.4 Meta rehearsals | **COMPLETE** — **PASS WITH NOTES**; rolled back |
| Agent A repo preflight P1–P8, P13–P20 | **PASS** |
| Operator live preflight P9–P12 | **NOT RUN** — required before GO |
| Operator command **GO ALL-CHANNEL DB_ONLY PILOT** | **Not received** — **HOLD** |
| All-channel **`DB_ONLY` enabled | **No** |
| Production-wide / long-running **`DB_ONLY`** | **NOT APPROVED** |

---

## Window actions D1–D7

Execute **only** after **`GO ALL-CHANNEL DB_ONLY PILOT`** and preflight **PASS**. **Not executed in this Agent A session.**

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| D1 | **GO time** captured | **`GO ALL-CHANNEL DB_ONLY PILOT`** + UTC | **NOT RUN** | |
| D2 | LINE runtime → **`DB_ONLY`** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY` | **NOT RUN** | |
| D3 | Facebook runtime → **`DB_ONLY`** | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_ONLY` | **NOT RUN** | |
| D4 | Instagram runtime → **`DB_ONLY`** | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY` | **NOT RUN** | |
| D5 | Resolver flag if required | Enable only if architecture requires | **NOT RUN** | **NOT REQUIRED** if absent (per CCP-4.3 / CCP-4.4 pattern) |
| D6 | Railway worker redeployed | Redeploy confirmed | **NOT RUN** | |
| D7 | Worker healthy after redeploy | `/ready` OK | **NOT RUN** | |

| Field | Placeholder |
|-------|-------------|
| GO time (UTC) | |
| All-channel enable time (UTC) | |
| Pilot duration | **30 minutes** |
| Scope | LINE + Facebook + Instagram **`DB_ONLY` together** |

---

## Monitoring checks M1–M14

During **30-minute** all-channel pilot. **Not executed in this Agent A session.**

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | LINE outbound smoke | **SENT**; `external_message_id` present | **NOT RUN** | Message id short: _____ |
| M2 | LINE queue job | **DONE**; `last_error` empty | **NOT RUN** | Job id short: _____ |
| M3 | Facebook outbound smoke | **SENT**; `external_message_id` present | **NOT RUN** | Message id short: _____ |
| M4 | Facebook queue job | **DONE**; `last_error` empty | **NOT RUN** | Job id short: _____ |
| M5 | Instagram outbound smoke | **SENT**; `external_message_id` present | **NOT RUN** | Message id short: _____ |
| M6 | Instagram queue job | **DONE**; `last_error` empty | **NOT RUN** | Job id short: _____ |
| M7 | Ops Runtime clean after all-channel smoke | vs P11/P12 baseline | **NOT RUN** | |
| M8 | Railway worker logs clean | No errors; no leak | **NOT RUN** | |
| M9 | Vercel logs clean | No critical API/auth errors | **NOT RUN** | |
| M10 | No secret/token/raw payload leak | None observed | **NOT RUN** | |
| M11 | **Mid-window (~15 min)** | Ops + logs clean | **NOT RUN** | If 30-minute pilot |
| M12 | **Final-window (~30 min)** | Ops + logs clean; hard stop met | **NOT RUN** | If 30-minute pilot |
| M13 | No unexpected **DEAD_LETTER** growth | vs P12 baseline | **NOT RUN** | |
| M14 | No stale **PROCESSING** growth | vs P11 baseline | **NOT RUN** | |

---

## Rollback checks R1–R12

Execute at **T+30 min** hard stop, on STOP condition, or operator stop. **Mandatory before merging final evidence.**

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Restore LINE runtime | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **NOT RUN** | |
| R2 | Restore Facebook runtime | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **NOT RUN** | |
| R3 | Restore Instagram runtime | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **NOT RUN** | |
| R4 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **NOT RUN** | |
| R5 | Redeploy Railway worker | Redeploy confirmed | **NOT RUN** | |
| R6 | Worker healthy after rollback | `/ready` OK | **NOT RUN** | |
| R7 | Post-rollback LINE recovery smoke | **SENT**; `external_message_id` present | **NOT RUN** | |
| R8 | Post-rollback Facebook recovery smoke | **SENT**; `external_message_id` present | **NOT RUN** | |
| R9 | Post-rollback Instagram recovery smoke | **SENT**; `external_message_id` present | **NOT RUN** | |
| R10 | Post-rollback queue jobs | **DONE**; `last_error` empty (all channels) | **NOT RUN** | |
| R11 | Ops Runtime clean after rollback | No new critical issue vs baseline | **NOT RUN** | |
| R12 | Final config state confirmed | All channels **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** | **NOT RUN** | |

| Field | Placeholder |
|-------|-------------|
| Rollback time (UTC) | |
| LINE recovery message id (short) | |
| Facebook recovery message id (short) | |
| Instagram recovery message id (short) | |

---

## SQL smoke queries (read-only)

Replace `<tenant_id>` with production tenant UUID. **Never commit secrets or full message content.**

### Latest outbound messages (all channels)

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
  and channel_type in ('LINE', 'FACEBOOK', 'INSTAGRAM')
  and direction = 'OUTBOUND'
order by created_at desc
limit 20;
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
limit 20;
```

### Queue / outbox stale and dead-letter (baseline)

```sql
select topic, status, count(*) as cnt
from queue_jobs
where tenant_id = '<tenant_id>'
group by topic, status
order by topic, status;

select id, topic, status, updated_at
from queue_jobs
where tenant_id = '<tenant_id>'
  and status = 'PROCESSING'
  and updated_at < now() - interval '300 seconds'
limit 20;

select status, count(*) as cnt
from outbox_events
where tenant_id = '<tenant_id>'
group by status;
```

**Ops Runtime alternative:** `/dashboard/ops` (ADMIN) — see [`hubchat-worker-queue-observability-runbook.md`](../../hubchat-worker-queue-observability-runbook.md).

**Known historical baseline (verify at P12):** inbound queue dead letter ≈ **6**; outbound queue dead letter ≈ **26** (CCP-3.8 / CCP-4.4 reference — confirm current at preflight).

---

## Stop conditions (immediate rollback)

| Condition | Action |
|-----------|--------|
| Any channel smoke fails | Rollback R1–R12 |
| Queue not **DONE** on success path | Rollback |
| `last_error` non-empty on success path | Rollback |
| `delivery_status` not **SENT** | Rollback |
| Unexpected **`ENV_FALLBACK`** under planned all-channel **`DB_ONLY`** | Rollback + investigate |
| Worker crash / restart loop | Rollback |
| Ops Runtime regression | Rollback |
| **DEAD_LETTER** or stale **PROCESSING** growth vs baseline | Rollback |
| Secret / token / raw payload leak | Rollback + SEC incident |
| Window exceeds **30 minutes** without separate approval | Rollback |
| Operator **STOP** | Rollback |

---

## Final decision (CCP-4.5)

**HOLD — AWAITING GO ALL-CHANNEL DB_ONLY PILOT**

- Preflight P1–P8, P13–P20 **PASS**; P9–P12 **NOT RUN** (operator before GO).
- All-channel pilot **not executed**. **`DB_ONLY` not enabled** on LINE, Facebook, or Instagram.
- Resolver flag **OFF / ABSENT** (P4 **PASS**).
- **`--execute` prohibited**; production-wide / long-running **`DB_ONLY` NOT APPROVED**.

### Final decision options (after execution)

| Outcome | When |
|---------|------|
| **PASS WITH NOTES — All-channel `DB_ONLY` controlled pilot complete and rolled back** | Pilot succeeds; R12 **PASS**; all recovery smokes **PASS** |
| **ROLLED BACK / HOLD** | Stop condition or rollback smoke failed |
| **Production-wide / long-running `DB_ONLY`** | **NOT APPROVED** even if pilot passes — requires **CCP-4.6** final decision |

**If pilot succeeds (wording guidance):**

- **PASS WITH NOTES** — all-channel **`DB_ONLY` controlled pilot complete and rolled back**
- All-channel **`DB_ONLY` proven only for controlled 30-minute pilot** — not long-running production
- Production-wide **`DB_ONLY` still NOT APPROVED**
- Long-running **`DB_ONLY` still NOT APPROVED** until **CCP-4.6** final decision

### Final production state (required after pilot)

| Item | Required state |
|------|----------------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

---

## Related docs

| Document | Use |
|----------|-----|
| [CCP-4.4 Meta rehearsal](./2026-06-06-ccp-4-4-meta-db-only-rehearsal-evidence.md) | Per-channel Meta rehearsals |
| [CCP-4.3 LINE pilot](./2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md) | LINE extended pilot |
| [CCP-4.2 rollout decision](../../channel-connect-db-only-rollout-decision.md) | Roadmap |
| [CCP-4.0 rehearsal plan](../../channel-connect-db-only-rehearsal-plan.md) | SQL / rollback patterns |
| [Worker queue observability](../../hubchat-worker-queue-observability-runbook.md) | Ops baselines |

---

## Verification (CCP-4.5 docs-only — pre-PR)

| Check | Result |
|-------|--------|
| Docs-only | **PASS** |
| All-channel **`DB_ONLY` enabled** | **No** |
| Resolver flag enabled | **No** |
| Secrets in doc | **No** |
| `git diff --check` | _(pre-PR)_ |
| Hidden/bidi scan | _(pre-PR)_ |
| npm test/build | **Skipped** (docs-only) |
