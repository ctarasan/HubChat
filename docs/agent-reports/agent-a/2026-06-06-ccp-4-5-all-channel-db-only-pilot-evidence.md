# CCP-4.5 — All-channel DB_ONLY Pilot Evidence

**Agent:** A
**Date:** 2026-06-06
**Phase:** All-channel **`DB_ONLY` Pilot COMPLETE** — rolled back to **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT**
**Result:** **PASS WITH NOTES**
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

| Guardrail | Status (CCP-4.5) |
|-----------|-------------------|
| Agent A enabled all-channel **`DB_ONLY`** | **No** — operator only during approved pilot |
| Agent A enabled `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **No** — remained **OFF / ABSENT** (D5 **NOT REQUIRED**) |
| Operator said **GO ALL-CHANNEL DB_ONLY PILOT** | **Yes** — pilot executed |
| Scope | **LINE + Facebook + Instagram `DB_ONLY` together** — **30-minute** time-boxed |
| Production env changes | **Operator only** (pilot window + rollback); final state safe |
| `DB_ONLY` left running | **No** — rolled back |
| Production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Long-running **`DB_ONLY`** | **NOT APPROVED** until **CCP-4.6** final decision (separate review) |
| **`--execute`** | **Not run / prohibited** |
| Product / runtime code changes | **None** |
| Secrets/tokens/raw payloads in this doc | **None** (partial row/job IDs; credential labels only) |

---

## Current production state (post-rollback — final)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (R1 **PASS**) |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (R2 **PASS**) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** (R3 **PASS**) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (R4 **PASS**) |
| All-channel **`DB_ONLY` left running** | **No** — rolled back (R12 **PASS**) |
| CCP-4.5 all-channel pilot | **COMPLETE** — **30-minute** window; **rolled back** |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |

### Channel Settings baseline (from prior phases — verify at P13–P15)

| Channel | Configured | Status | Last error | Credentials (labels only) |
|---------|------------|--------|------------|---------------------------|
| **LINE** | **Yes** | **READY** | **None recorded** | Channel secret **SET**; channel access token **SET** — values **not exposed** |
| **Facebook** | **Yes** | **READY** | **None recorded** | Page access token **SET**; app secret **SET** — values **not exposed** |
| **Instagram** | **Yes** | **READY** | **None recorded** | Access token **SET**; verify token **SET** — values **not exposed** |

---

## Preflight checklist P1–P20

Complete **immediately before** all-channel pilot enable. **CCP-4.5 operator verification:** P1–P20 **PASS**.

| # | Check | Pass criteria | Result | Sanitized evidence |
|---|--------|---------------|--------|-------------------|
| P1 | `master` synced to latest `origin/master` | HEAD matches `origin/master`; clean pull | **PASS** | HEAD `2048d64` — `git pull --ff-only` clean |
| P2 | PR **#190** (CCP-4.4) included in `master` | Merge commit on `master` | **PASS** | Operator confirmed master synced; CCP-4.4 Meta rehearsal merged |
| P3 | Production mode **`DB_WITH_ENV_FALLBACK`** | LINE / FB / IG on fallback | **PASS** | Documented safe state pre-pilot |
| P4 | Resolver flag **OFF / ABSENT** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` absent from Railway worker | **PASS** | Flag **OFF / ABSENT** |
| P5 | LINE **`DB_ONLY` not currently enabled** (pre-pilot) | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-pilot baseline |
| P6 | Facebook **`DB_ONLY` not currently enabled** (pre-pilot) | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-pilot baseline |
| P7 | Instagram **`DB_ONLY` not currently enabled** (pre-pilot) | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` ≠ `DB_ONLY` | **PASS** | Pre-pilot baseline |
| P8 | **`--execute` not used / prohibited** | No credential migration execute | **PASS** | Guardrails; prohibited |
| P9 | Railway worker healthy | `/ready` OK; no restart loop | **PASS** | Health confirmed before all-channel pilot |
| P10 | Vercel app/API healthy | Production **Ready**; API acceptable | **PASS** | Vercel/API healthy before pilot |
| P11 | Ops Runtime baseline captured | Pending / processing / stale / dead-letter from `/dashboard/ops` | **PASS** | Baseline captured before pilot |
| P12 | Historical dead-letter baseline documented | Record current baselines | **PASS** | Inbound queue dead letter **6**; outbound queue dead letter **26** — historical baseline |
| P13 | LINE Channel Settings / Test connection **READY** | LINE **READY** for pilot | **PASS** | LINE configured **Yes**; status **READY** |
| P14 | Facebook Channel Settings / Test connection **READY** | Facebook **READY** | **PASS** | Facebook configured **Yes**; status **READY** |
| P15 | Instagram Channel Settings / Test connection **READY** | Instagram **READY** | **PASS** | Instagram configured **Yes**; status **READY** |
| P16 | Rollback owner assigned | Owner available for full pilot + rollback | **PASS** | **Chamnan / Operator** |
| P17 | Pilot duration selected | **30 minutes** recommended | **PASS** | Duration: **30 minutes** |
| P18 | Hard stop defined | **30 minutes after all-channel enable** | **PASS** | Hard stop: **T+30 min** from enable |
| P19 | **GO** phrase required | **`GO ALL-CHANNEL DB_ONLY PILOT`** before execution | **PASS** | Operator phrase: **`GO ALL-CHANNEL DB_ONLY PILOT`** |
| P20 | Decision before execution | Operator **GO** received | **PASS** | Pilot authorized |

**Preflight gate for execution:** P1–P20 operator-applicable items **PASS** + operator **`GO ALL-CHANNEL DB_ONLY PILOT`** → may begin D1–D7.

### Operator approval gate

| Item | Status |
|------|--------|
| CCP-4.4 Meta rehearsals | **COMPLETE** — **PASS WITH NOTES**; rolled back |
| Operator preflight P1–P20 | **PASS** |
| Operator command **GO ALL-CHANNEL DB_ONLY PILOT** | **Received** |
| All-channel pilot executed | **Yes** — **30-minute** window; **rolled back** |
| Production-wide / long-running **`DB_ONLY`** | **NOT APPROVED** |

---

## Window actions D1–D7

Executed after **`GO ALL-CHANNEL DB_ONLY PILOT`** and preflight **PASS**. Operator-run; sanitized evidence recorded by Agent A.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| D1 | **GO time** captured | **`GO ALL-CHANNEL DB_ONLY PILOT`** + UTC | **PASS** | Operator phrase: **`GO ALL-CHANNEL DB_ONLY PILOT`** |
| D2 | LINE runtime → **`DB_ONLY`** | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_ONLY` | **PASS** | LINE **`DB_ONLY`** smoke succeeded (M1) |
| D3 | Facebook runtime → **`DB_ONLY`** | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_ONLY` | **PASS** | Facebook **`DB_ONLY`** smoke succeeded (M3) |
| D4 | Instagram runtime → **`DB_ONLY`** | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY` | **PASS** | Instagram **`DB_ONLY`** smoke succeeded (M5) |
| D5 | Resolver flag if required | Enable only if architecture requires | **NOT REQUIRED** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** throughout |
| D6 | Railway worker redeployed | Redeploy confirmed | **PASS** | Worker redeploy after env change confirmed |
| D7 | Worker healthy after redeploy | `/ready` OK | **PASS** | Health confirmed after redeploy |

| Field | Value |
|-------|--------|
| All-channel smoke window (UTC) | Instagram `12:33:36` · Facebook `12:33:55` · LINE `12:34:15` |
| Pilot duration | **30 minutes** |
| Scope | LINE + Facebook + Instagram **`DB_ONLY` together** |

---

## Monitoring checks M1–M14

During **30-minute** all-channel pilot. Operator-run; sanitized evidence recorded by Agent A.

| # | Check | Pass criteria | Result | Notes |
|---|--------|---------------|--------|-------|
| M1 | LINE outbound smoke | **SENT**; `external_message_id` present | **PASS** | Message `2d192f09`; **OUTBOUND**; `channel_type` **LINE**; `created_at` `2026-06-06 12:34:15+00`; `external_message_id_present` = true |
| M2 | LINE queue job | **DONE**; `last_error` empty | **PASS** | Job `2b6b941f`; `created_at` `2026-06-06 12:34:15+00`; **DONE**; `last_error_empty` = true |
| M3 | Facebook outbound smoke | **SENT**; `external_message_id` present | **PASS** | Message `ed07277e`; **OUTBOUND**; `channel_type` **FACEBOOK**; `created_at` `2026-06-06 12:33:55+00`; `external_message_id_present` = true |
| M4 | Facebook queue job | **DONE**; `last_error` empty | **PASS** | Job `a583b8a7`; `created_at` `2026-06-06 12:33:56+00`; **DONE**; `last_error_empty` = true |
| M5 | Instagram outbound smoke | **SENT**; `external_message_id` present | **PASS** | Message `75cadca5`; **OUTBOUND**; `channel_type` **INSTAGRAM**; `created_at` `2026-06-06 12:33:36+00`; `external_message_id_present` = true |
| M6 | Instagram queue job | **DONE**; `last_error` empty | **PASS** | Job `98ee86b8`; `created_at` `2026-06-06 12:33:36+00`; **DONE**; `last_error_empty` = true |
| M7 | Ops Runtime clean after all-channel smoke | vs P11/P12 baseline | **PASS** | Ops Runtime clean after all-channel smoke |
| M8 | Railway worker logs clean | No errors; no leak | **PASS** | Worker logs clean |
| M9 | Vercel logs clean | No critical API/auth errors | **PASS** | Vercel logs clean |
| M10 | No secret/token/raw payload leak | None observed | **PASS** | No leak observed |
| M11 | **Mid-window (~15 min)** | Ops + logs clean | **PASS** | Mid-window check **PASS** |
| M12 | **Final-window (~30 min)** | Ops + logs clean; hard stop met | **PASS** | Final-window check **PASS**; hard stop met |
| M13 | No unexpected **DEAD_LETTER** growth | vs P12 baseline | **PASS** | No unexpected dead-letter growth |
| M14 | No stale **PROCESSING** growth | vs P11 baseline | **PASS** | No stale processing growth |

---

## Rollback checks R1–R12

Executed at **T+30 min** hard stop. Operator-run; sanitized evidence recorded by Agent A.

| # | Step | Expected | Result | Sanitized evidence |
|---|------|----------|--------|-------------------|
| R1 | Restore LINE runtime | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | LINE runtime restored to **`DB_WITH_ENV_FALLBACK`** |
| R2 | Restore Facebook runtime | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | Facebook runtime restored to **`DB_WITH_ENV_FALLBACK`** |
| R3 | Restore Instagram runtime | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` | **PASS** | Instagram runtime restored to **`DB_WITH_ENV_FALLBACK`** |
| R4 | Resolver flag **OFF / ABSENT** | Flag removed or disabled | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **OFF / ABSENT** |
| R5 | Redeploy Railway worker | Redeploy confirmed | **PASS** | Worker redeploy after rollback confirmed |
| R6 | Worker healthy after rollback | `/ready` OK | **PASS** | Health confirmed after rollback |
| R7 | Post-rollback LINE recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `df4664e9`; **OUTBOUND**; `channel_type` **LINE**; `created_at` `2026-06-06 12:42:24+00`; `external_message_id_present` = true |
| R8 | Post-rollback Facebook recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `1e0035a7`; **OUTBOUND**; `channel_type` **FACEBOOK**; `created_at` `2026-06-06 12:50:27+00`; `external_message_id_present` = true; `delivery_status` **SENT** |
| R9 | Post-rollback Instagram recovery smoke | **SENT**; `external_message_id` present | **PASS** | Message `ba026f33`; **OUTBOUND**; `channel_type` **INSTAGRAM**; `created_at` `2026-06-06 12:42:39+00`; `external_message_id_present` = true |
| R10 | Post-rollback queue jobs | **DONE**; `last_error` empty (all channels) | **PASS** | LINE job `7e3a01cf` @ `12:42:24+00`; Instagram job `81ae0b64` @ `12:42:39+00`; Facebook job `a7f17cac` @ `12:50:27+00` — all **DONE**; `last_error_empty` = true |
| R11 | Ops Runtime clean after rollback | No new critical issue vs baseline | **PASS** | Ops Runtime clean after rollback |
| R12 | Final config state confirmed | All channels **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** | **PASS** | LINE / Facebook / Instagram **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** |

| Field | Value |
|-------|--------|
| LINE recovery smoke (UTC) | `2026-06-06 12:42:24+00` |
| Instagram recovery smoke (UTC) | `2026-06-06 12:42:39+00` |
| Facebook recovery smoke (UTC) | `2026-06-06 12:50:27+00` |

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

**PASS WITH NOTES — All-channel `DB_ONLY` controlled pilot complete and rolled back**

| Item | State |
|------|--------|
| CCP-4.5 all-channel **`DB_ONLY` pilot | **COMPLETE** |
| Result | **PASS WITH NOTES** |
| LINE **`DB_ONLY` during pilot | **PASS** — M1/M2 |
| Facebook **`DB_ONLY` during pilot | **PASS** — M3/M4 |
| Instagram **`DB_ONLY` during pilot | **PASS** — M5/M6 |
| Monitoring M7–M14 | **PASS** |
| Rollback R1–R12 | **PASS** |
| Final production state | LINE / Facebook / Instagram **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** |
| `DB_ONLY` left running | **No** |
| **`--execute`** | **Not used / prohibited** |
| Secret/token/raw payload leaks | **None observed** |
| Product / runtime code changes | **None** |
| Rollback owner | **Chamnan / Operator** |
| Production-wide permanent **`DB_ONLY`** | **NOT APPROVED** until **CCP-4.6** final rollout decision |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |

**Notes (PASS WITH NOTES rationale):**

- D5: Resolver flag **NOT REQUIRED** — remained **OFF / ABSENT** throughout; pilot used per-channel runtime mode vars only.
- Facebook recovery smoke (R8) completed after LINE/Instagram recovery — still **PASS** with `delivery_status` **SENT**.
- **Controlled all-channel pilot success does not approve long-running or production-wide permanent `DB_ONLY`.** This PR proves only a **controlled 30-minute all-channel pilot and mandatory rollback**.

**Next phase required:** **CCP-4.6 Final `DB_ONLY` Rollout Decision & Closure** — separate review and explicit decision before any permanent **`DB_ONLY`** rollout.

**Not approved / not recommended:**

- Production-wide permanent **`DB_ONLY`** — **NOT APPROVED**
- Long-running **`DB_ONLY`** — **NOT APPROVED**
- Broad permanent **`DB_ONLY` rollout** — **not recommended** from CCP-4.5 alone

### Final production state (confirmed post-rollback)

| Item | State |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` | **Not running** |
| Long-running / production-wide permanent **`DB_ONLY`** | **NOT APPROVED** |

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
| All-channel **`DB_ONLY` enabled (final state)** | **No** — rolled back |
| Resolver flag (final state) | **OFF / ABSENT** |
| Secrets in doc | **No** |
| `git diff --check` | _(pre-PR)_ |
| Hidden/bidi scan | _(pre-PR)_ |
| npm test/build | **Skipped** (docs-only) |
