# IG-CRED-1I — Instagram Legacy Credential Post-Write Runtime Verification

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-23 |
| Phase | IG-CRED-1I (read-only post-write runtime verification) |
| Authorization | `GO INSTAGRAM POST-WRITE READ-ONLY VERIFICATION` |
| Master SHA | `50087f028cb12c452c0f0a0891841e2e25e222eb` |
| Prior execution evidence | PR #279 (`docs/agent-reports/agent-a/2026-06-23-ig-cred-1c-e-env-reconciliation-execution.md`) |
| Credential write in this task | **NO** (post-write verification only) |

## Executive summary

Read-only verification confirms production Instagram legacy credential recovery **closure criteria** are met: Railway Instagram mode remains **`DB_ONLY`**, worker is **running and healthy**, Channel Settings API reports Instagram **`READY`** with **`lastError` cleared**, canonical page fingerprint **`5418…len=15`**, Facebook/LINE remain **READY**, queue/outbox **idle**. ENV fallback for Instagram outbound is **not eligible** under `DB_ONLY` with READY DB credential.

**Decision:** `PASS WITH NOTES` — per-channel queue SQL unavailable; `runtimeSource=db` not live-proven (no outbound job); startup log line not in current log window (ENV + prior IG-CRED-1E startup evidence used).

**Operational state:** `HOLD — NO ADDITIONAL CREDENTIAL OR OUTBOUND ACTION`

---

## Phase 1 — Repository verification

| Check | Result |
| --- | --- |
| `HEAD` | `50087f028cb12c452c0f0a0891841e2e25e222eb` |
| `origin/master` | `50087f028cb12c452c0f0a0891841e2e25e222eb` |
| Matches known baseline | **YES** |
| Working tree clean | **YES** |
| `supabase/.temp/` | **ABSENT** |
| Relevant Instagram resolver code change since baseline | **NO** |

---

## Phase 2 — Railway runtime mode

| Field | Value |
| --- | --- |
| Project | SmartKorp Hub Chat |
| Service | worker |
| Environment | production |
| Deployment ID | `134088f7-4c19-4460-96a2-2843dbba9df4` |
| Deployment status | **Online / healthy** |
| Deployment loop started UTC (worker `/ready`) | `2026-06-23T04:00:39Z` |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_ONLY`** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` (unchanged) |
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` (unchanged) |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **SET** (unchanged) |
| `FACEBOOK_PAGE_ID` | **SET** (unchanged) |

### Startup log evidence

Current Railway log window did **not** retain the boot line (worker uptime >30m at capture). Required mode confirmed by:

1. Live ENV read: `DB_ONLY`
2. Prior IG-CRED-1C-E execution captured: `[worker] Instagram outbound runtime config mode { instagramRuntimeConfigMode: 'DB_ONLY' }`

| Mode | Confirmed |
| --- | --- |
| Instagram | **DB_ONLY** |
| Facebook | **DB_WITH_ENV_FALLBACK** |
| LINE | **DB_WITH_ENV_FALLBACK** |

---

## Phase 3 — Worker execution state

| Check | Result |
| --- | --- |
| Worker running | **YES** |
| Worker paused/suspended | **NO** |
| Worker `/ready` status | **healthy** |
| `ok` | **true** |
| `outboundReady` | **true** |
| `shuttingDown` | **false** |

---

## Phase 4 — Fresh queue/outbox snapshot

Snapshot UTC: **`2026-06-23T04:36:36Z`** (worker `/ready`)

| Metric | Value | Source |
| --- | --- | --- |
| Worker ready | **YES** | `/ready` |
| Global queue depth | **0** | `metrics.gauges.queueDepth` |
| Global pending | **0** | same as queue depth (global aggregate) |
| Global processing | **0** | `loops.outbound.activeCount` |
| Outbound activeCount | **0** | `/ready` |
| Outbox depth | **0** | `metrics.gauges.outboxDepth` |
| Outbox pending | **0** | same as outbox depth |
| Stale processing | **0** | `unhealthyLoops` empty |
| Delayed/scheduled claims | **not queried** | — |
| Global DEAD_LETTER | **not queried** | — |
| Tenant Instagram DEAD_LETTER | **not queried** | — |
| Instagram-specific SQL | **NOT AVAILABLE** | Supabase CLI not linked |

No inferred per-channel counts reported as queried facts.

---

## Phase 5 — Instagram status (read-only API)

Probe UTC: **`2026-06-23T04:44:09Z`** — `GET /api/channel-settings` (ADMIN session, read-only; no Save/Test Connection).

| Field | Result |
| --- | --- |
| HTTP status | **200** |
| Configured | **YES** |
| Enabled | **YES** |
| Status | **READY** |
| Last error | **NONE** (`null`) |
| Last verified | **`2026-06-23T04:27:22.188Z`** (after credential recovery window) |
| Updated at | **`2026-06-23T04:27:22.413Z`** |
| Canonical Page (masked) | **`5418…len=15`** |
| Provider account name (truncated) | `SMARTKORP.TH` |

Aligns with approved operator/UI baseline (READY, connection verified, no last error).

---

## Phase 6 — DB-source safety

| Check | Result |
| --- | --- |
| Railway Instagram mode | **DB_ONLY** |
| Instagram DB credential status | **READY** |
| ENV fallback eligible | **NO** (`DB_ONLY` prohibits ENV fallback) |
| Shared `FACEBOOK_PAGE_ACCESS_TOKEN` | **unchanged (SET)** |
| Shared `FACEBOOK_PAGE_ID` | **unchanged (SET)** |
| `runtimeSource=db` in live logs | **NOT OBSERVED** (queue idle) |
| Live delivery path exercised | **NO** |
| Wrong-identity ENV fallback possible | **NO** |

**Safety conclusion basis:** `DB_ONLY` startup mode + READY DB credential + reviewed resolver code (`resolveInstagramOutboundConfig` DB_ONLY path).

```text
DB source live delivery path:
NOT EXERCISED — NO OUTBOUND JOB CREATED
```

---

## Phase 7 — Unexpected provider activity

| Check | Result |
| --- | --- |
| Outbound job created by this task | **NO** |
| Provider delivery attempted by this task | **NO** |
| Queue retry | **NO** |
| DLQ retry | **NO** |
| OAuth action | **NO** |
| Migration action | **NO** |
| Raw token in logs | **NO** |
| Authorization header in logs | **NO** |
| Full provider ID exposed | **NO** |
| Raw Meta response exposed | **NO** |

---

## Phase 8 — Cross-channel non-regression

Read-only `GET /api/channel-settings` (same probe):

| Channel | Status | Last error |
| --- | --- | --- |
| Facebook | **READY** | **NONE** |
| LINE | **READY** | **NONE** |
| Inbound worker loop | **ready** | `/ready` inbound loop healthy |

No Test Connection or outbound message used.

---

## Phase 9 — Closure assessment

| Criterion | Met |
| --- | --- |
| Master/working tree clean | **YES** |
| Railway mode DB_ONLY | **YES** |
| Worker running and ready | **YES** |
| Instagram READY | **YES** |
| lastError cleared | **YES** |
| Queue/outbox idle | **YES** (global metrics) |
| No ENV fallback eligibility | **YES** |
| Facebook/LINE READY | **YES** |
| No secret leak | **YES** |
| No prohibited action | **YES** |

**Decision:** `PASS WITH NOTES`

**Notes:**

- Per-channel queue SQL not available; global `/ready` metrics only.
- `runtimeSource=db` not live-proven; safety via `DB_ONLY` + READY DB + code review.
- Startup log line not in current Railway window; ENV + IG-CRED-1E boot evidence used.

---

## Phase 10 — Secret scan (evidence doc)

| Scan | Result |
| --- | --- |
| Access tokens in doc | **NONE** |
| Authorization headers | **NONE** |
| Full Page/IG IDs | **NONE** (masked `5418…len=15` only) |
| Customer content | **NONE** |
| Database credentials | **NONE** |
| Hidden/bidi | **PASS** (pending `git diff --check`) |

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Credential write | **NO** |
| Save Instagram | **NO** |
| Test Connection | **NO** |
| ENV change | **NO** |
| Worker redeploy | **NO** |
| Outbound smoke | **NO** |
| Queue/DLQ retry | **NO** |
| Migration | **NO** |

---

## IG-CRED-1I POST-WRITE RUNTIME VERIFICATION RESULT

```text
IG-CRED-1I POST-WRITE RUNTIME VERIFICATION RESULT

Latest master SHA: 50087f028cb12c452c0f0a0891841e2e25e222eb
Agent A working tree clean: YES

Railway:
- Project: SmartKorp Hub Chat
- Service: worker
- Environment: production
- Deployment ID: 134088f7-4c19-4460-96a2-2843dbba9df4
- Deployment healthy: YES
- Worker running: YES
- Worker paused: NO
- Worker ready: YES
- Instagram startup mode: DB_ONLY (ENV + prior boot evidence)
- Facebook startup mode: DB_WITH_ENV_FALLBACK
- LINE startup mode: DB_WITH_ENV_FALLBACK

Fresh snapshot UTC: 2026-06-23T04:36:36Z
- Queue depth: 0
- Pending: 0
- Processing: 0
- Outbound activeCount: 0
- Outbox depth: 0
- Stale processing: 0
- Instagram-specific SQL available: NO
- DEAD_LETTER delta: NOT QUERIED

Instagram:
- Configured: YES
- Enabled: YES
- Status: READY
- Last error: NONE
- Last verified: 2026-06-23T04:27:22.188Z
- Canonical Page masked: 5418…len=15
- DB credential READY: YES
- ENV fallback eligible: NO
- runtimeSource=db observed: NO
- Live delivery path exercised: NO

Cross-channel:
- Facebook READY: YES
- LINE READY: YES
- Inbound worker health: PASS

Security:
- Raw token exposed: NO
- Authorization header exposed: NO
- Full provider ID exposed: NO
- Secret scan: PASS

Credential write executed in this task: NO
Save Instagram executed in this task: NO
Test Connection executed in this task: NO
ENV changed in this task: NO
Worker redeployed in this task: NO
Outbound smoke executed in this task: NO
Queue/DLQ retry executed in this task: NO
Migration operation executed in this task: NO

Decision: PASS WITH NOTES

Recommended next gate: READY FOR AGENT B CLOSURE REVIEW

Operational state: HOLD — NO ADDITIONAL CREDENTIAL OR OUTBOUND ACTION
```
