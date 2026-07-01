# META-CRED-1D-L-E4A-C — Supabase Backup/PITR Verification

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-E4A-C (read-only verification only) |
| Supabase project ref | `dskyvomvpkqqznvmnhyx` |
| Project name | SmartKorp Hub Chat |
| Organization id (sanitized) | `rommuf…clesot` |
| Region | South Asia (Mumbai) / `ap-south-1` |
| Production master baseline (at verification) | `4a45c552da835ca62aeddf692d7d27eafb8474ec` |
| Prior E4A assessment | PASS — PR #302 (`026aec99…`) |
| Verification timestamp (UTC) | 2026-07-01T07:43Z (approx.) |

## Executive summary

Using an **existing authenticated Supabase CLI session** on the operator machine, Agent A independently verified **automated daily physical backups are enabled and succeeding**, with a **concrete latest COMPLETED backup** visible. **PITR is DISABLED** (`pitr_enabled: false`). A **post–RETRY-5 restore reference exists** at the latest daily snapshot; **PITR sub-minute rollback is not available**.

**Final decision: PASS WITH NOTES — BACKUP/PITR RESTORE POINT VERIFIED FOR E4B PLANNING**

This authorizes **further E4B planning and independent review only**. It does **not** authorize purge execution, worker pause, webhook gating, backup creation, restore, deployment, or environment changes.

---

## 1. Access and identity lock

| Check | Result |
| --- | --- |
| Approved access method | **Existing authenticated Supabase CLI session** (local CLI profile; project linked). `SUPABASE_ACCESS_TOKEN` environment variable **ABSENT**; CLI platform API calls succeeded via stored session. |
| New Supabase access token created or retrieved | **NO** |
| Organization | `rommuf…clesot` (sanitized org id) |
| Project name | SmartKorp Hub Chat |
| Project ref | `dskyvomvpkqqznvmnhyx` ✓ |
| Production environment identity | Linked production project; status **ACTIVE_HEALTHY**; Postgres **17.6.1.104** |
| Operator role (sanitized) | Organization member with platform CLI access sufficient to list projects and backups |
| Can view backup / restore metadata | **YES** — `supabase backups list --project-ref dskyvomvpkqqznvmnhyx` succeeded |
| Can initiate restore operations | **Metadata visible only in this task** — restore is a separate privileged, destructive dashboard (or PITR API) action; **not attempted** |
| Organization / project / role settings modified | **NONE** |

**Note on Agent B:** Agent B’s earlier `LegacyPlatformAuthRequiredError` reflected **missing platform auth in that environment**, not absence of backups. Agent A verification used an **already-approved local CLI session** on the operator machine.

---

## 2. Current plan and backup capability

| Field | Value |
| --- | --- |
| Plan / backup tier (visible) | **Pro-equivalent daily physical backups inferred** — CLI returned **approximately 8 consecutive daily COMPLETED physical backups** spanning **approximately 7 calendar days** (consistent with Supabase Pro **7-day retention**; **exact Supabase plan name was not returned by CLI JSON** — describe as inferred capability only) |
| Automated database backups | **ENABLED** (`walg_enabled: true`, daily physical snapshots present) |
| Backup frequency | **Daily** (~01:04–01:05 UTC observed) |
| Backup retention | **7 days** (inferred from visible window; oldest listed **2026-06-24**, newest **2026-07-01**) |
| Postgres coverage | **Complete physical database snapshot** (Supabase physical backup model) |
| Supabase Storage objects | **EXCLUDED** — backups store Storage metadata in Postgres only, not object contents |
| Edge Functions | **NOT included** in database backups (code lives outside Postgres) |
| Environment secrets | **NOT included** — dashboard/env secrets are outside database backup payload |
| External provider data (Meta, etc.) | **NOT included** |
| Behavior during project pause / maintenance | Per Supabase docs: project inaccessible during restore; backup schedule managed by platform (not modified in this task) |

---

## 3. Latest successful backup

| Field | Value |
| --- | --- |
| Latest successful backup timestamp | **2026-07-01T01:05:04.595Z** |
| Timezone | **UTC** (CLI `CREATED AT (UTC)` / JSON `inserted_at`) |
| Status | **COMPLETED** |
| Backup type | **PHYSICAL** (`is_physical_backup: true`) |
| Approximate age (at verification) | **~6.5 hours** |
| Sanitized backup identifier | **`1008877754`** |
| Retention expiration | Not individually shown; falls within **7-day** rolling window |

### Temporal relationship (sanitized checkpoints)

| Checkpoint | Relative to latest backup (`2026-07-01T01:05:04Z`) |
| --- | --- |
| Meta Page credential RETRY-5 activation | **PREDATES** — RETRY-5 PASS confirmed **2026-06-30** (post `e6a0903…` deploy); backup **includes** expected ACTIVE credential v1 state |
| Credential version 1 creation | **PREDATES** (same as RETRY-5) |
| PR #300 merge (`aa885ba…`) | **POSTDATES** — merged **2026-07-01T05:47:57Z** (code/deploy artifact; no required DB migration for rollback assessment) |
| PR #301 merge (`4a45c552…`) | **POSTDATES** — merged **2026-07-01T05:51:00Z** |
| E4A assessment execution | **POSTDATES** backup timestamp (assessment **2026-07-01**, later UTC) |

**Critical:** Backups on **2026-06-30T01:04:52Z** and earlier **predate RETRY-5** and are **insufficient alone** for credential-state rollback. Only backups **after RETRY-5** (i.e., **2026-07-01** daily snapshot onward) preserve ACTIVE credential v1 / COMPLETED activation.

---

## 4. PITR verification

| Field | Value |
| --- | --- |
| PITR state | **DISABLED** (`pitr_enabled: false` in CLI JSON) |
| Earliest visible daily snapshot | **2026-06-24T01:04:15.836Z UTC** |
| Latest visible daily snapshot | **2026-07-01T01:05:04.595Z UTC** |
| Earliest available PITR recovery point | **N/A** (PITR disabled) |
| Latest available PITR recovery point | **N/A** (PITR disabled) |
| Recovery granularity | **Daily physical snapshot only** (~24-hour RPO worst case) |
| Retention duration (PITR) | **N/A** |
| Continuous recovery window | **NO** |
| Visible gaps / warnings | None reported; WAL infrastructure present (`walg_enabled: true`) but PITR add-on off |
| WAL / recovery health | Platform-managed; no operator-visible unhealthy warning |

**Fallback:** Automated **daily physical backups** remain usable for whole-project restore to listed snapshot timestamps.

---

## 5. Restore model (Supabase documented behavior)

| Question | Answer |
| --- | --- |
| Whole-project vs database-only | **In-place whole-project database restore** from Dashboard **Database → Backups** (physical snapshot replayed into same project) |
| Individual table restore | **NOT directly supported** — full-database restore only via platform flow |
| Overwrites current project vs new project | **Overwrites current project** in standard restore; separate **clone-to-new-project** is a different workflow |
| Downtime required | **YES** — project **inaccessible during restore**; duration scales with database size |
| Expected duration | **Not published** for this project; operator must plan maintenance window |
| Project URL / DB hostname change | **NO** for in-place scheduled-backup restore (same ref `dskyvomvpkqqznvmnhyx`) |
| Connection strings / service-role / JWT secrets change | **NO** for in-place restore to same project (per Supabase restore model) |
| Railway / Vercel impact | Apps keep same Supabase URL/keys; **DB unavailable during restore** → worker/web/API DB calls fail until complete; no redeploy required solely for restore |
| Impact on post-backup writes | **All commits after restore point are lost** on restore (including new conversations, queue/outbox rows, webhook_events, etc.) |
| `meta_page_credentials` / bindings / activation | **Restored to backup-time state** — post-backup credential edits lost; **pre-RETRY-5 backups would drop v1 credential** |
| `channel_connections` | Restored to backup-time rows |
| Queue / outbox | Restored to backup-time rows |
| Storage objects | **NOT restored** with Postgres backup — existing `inbound-media` / `profile-avatars` objects remain as-is in Storage |
| Restored DB could contain older credential state | **YES** if an older backup is chosen — **must select post–RETRY-5 snapshot** |

**Not performed:** restore, PITR enablement, backup download.

---

## 6. Required permissions and operator procedure

| Item | Detail |
| --- | --- |
| Roles that can initiate restore | **Privileged organization/project owner or admin** (destructive platform action; exact role label depends on Supabase org membership) |
| Organization Owner required | **Typically yes** or equivalent high-privilege project access for production restore |
| Additional support approval | **Not indicated** for standard dashboard restore; contact support if restore fails |
| Dashboard navigation | **Database → Backups → Scheduled** → select scheduled snapshot → confirm destructive in-place restore |
| CLI | `supabase backups list` (read); `supabase backups restore` documented for **PITR timestamp** (not used; PITR disabled) |
| Confirmation / warnings | Dashboard **requires explicit confirmation**; warns of downtime and data loss back to selected point |
| Cancel after initiation | **Assume no** — treat restore as irreversible once started |
| Verify completion | Dashboard notification when restore completes; then run read-only preserve-state counts |
| Railway / Vercel during restore | **Pause worker / gate webhooks recommended** before restore to avoid partial writes; resume after DB healthy |

**Not performed:** permission changes.

---

## 7. Concrete rollback reference

| Field | Value |
| --- | --- |
| Selected recommendation | **B — Recent successful automated daily physical backup** (PITR option **A** unavailable) |
| Exact reference | **2026-07-01T01:05:04.595Z UTC**, backup id **`1008877754`**, status **COMPLETED**, type **PHYSICAL** |
| Acceptable data-loss window | **Up to ~24 hours** of production DB writes for tables outside the purge scope (daily snapshot granularity); **all Phase 1 purge table deletes would be reversed** if restore is invoked after a bad COMMIT |
| Records lost on restore (relative to live DB) | Any DB rows committed **after** `2026-07-01T01:05:04Z` |
| Credentials / activation reverted? | **Only if an older backup is used** — **2026-07-01** snapshot expected to **preserve** ACTIVE credential v1, ACTIVE FACEBOOK binding, COMPLETED activation |
| New activation required after rollback? | **NO** if restore uses **post–RETRY-5** snapshot — **activation replay must not be used as rollback** |
| Option C (fresh logical backup pre-E4B) | **Recommended as separate optional gate** — not required to prove platform backup exists, but improves RPO below 24h |
| Option D | **Not applicable** — usable mechanism exists |

---

## 8. Logical backup assessment

| Question | Assessment |
| --- | --- |
| `pg_dump` / CLI `db dump` permitted? | **Technically yes** with database credentials and explicit authorization — **not executed in E4A-C** |
| Without exposing production data? | Dump files contain production data — requires **encrypted, access-controlled off-site storage** |
| Credentials beyond current approval? | **Yes** — DB connection string / role password needed (separate from platform token) |
| Scope | Default dump is **whole database**; selective table dump possible but not verified here |
| Encryption / storage / disposal | **Operator policy required** — not defined in E4A-C |
| Restore test | **Not performed** — recommend isolated staging restore test only under separate authorization |
| E4A-C action | **NONE** — if required, record as **prerequisite gate before E4B COMMIT** |

---

## 9. Purge timing relationship

| Question | Answer |
| --- | --- |
| Is latest backup recent enough for planning? | **YES for planning**; **must revalidate on E4B execution day** |
| Freeze production writes before rollback timestamp? | **YES** — worker pause and webhook ingress gating **required before E4B COMMIT** and before final rollback reference is recorded |
| PITR immediately before COMMIT? | **NO** — PITR disabled |
| Recheck backup metadata on E4B day? | **YES — mandatory** |
| Maximum interval backup confirmation → deletion | **Recommend same calendar day** after write freeze; ideally use **first daily backup after freeze** or approved logical backup |

**Not performed:** service pause, purge, COMMIT.

---

## 10. Restore impact on Meta credential state

| State element | Impact if restoring `2026-07-01T01:05:04Z` snapshot |
| --- | --- |
| ACTIVE Meta Page credential v1 | **Expected preserved** (RETRY-5 predates snapshot) |
| ACTIVE Facebook binding | **Expected preserved** |
| COMPLETED activation request | **Expected preserved** |
| Channel connection state | **Restored to backup-time** (READY Facebook connection expected) |
| Deployment-related DB state | Code deploy artifacts (#300/#301) are **not in DB**; any DB writes after snapshot lost on restore |
| Queue / outbox | Restored to backup-time idle state |

### Mandatory E4B pre-deletion preserve-state counts (unchanged from E4A)

Immediately before COMMIT, operator must assert:

- exactly **1** ACTIVE Meta Page credential, version **1**
- exactly **1** ACTIVE Facebook binding, **0** Instagram
- activation request **COMPLETED**
- queue/outbox **healthy and idle**
- resolver and activation flags **OFF / ABSENT**

---

## 11. Storage coverage

| Asset | Covered by verified backup/restore? |
| --- | --- |
| Postgres rows (chat + credential tables) | **YES** (physical DB snapshot) |
| `inbound-media` objects (92 refs in E4A) | **NO** — objects not in backup |
| `profile-avatars` objects (28 cached paths in E4A) | **NO** |
| Storage metadata in Postgres | **YES** (as DB rows) |
| Object contents | **NO** |

**E4B Phase 1 excludes Storage deletion.** Leaving Storage objects unchanged **does not block** Postgres rollback via daily physical restore.

---

## 12. Evidence capture (sanitized)

Captured via read-only CLI:

```text
supabase backups list --project-ref dskyvomvpkqqznvmnhyx -o json
```

Sanitized fields recorded: project ref, region, backup ids, UTC timestamps, statuses, `pitr_enabled`, `walg_enabled`.

**Not captured:** tokens, passwords, connection strings, dump contents, customer/message data.

---

## 13. Production actions

| Action | Performed |
| --- | --- |
| Production changes | **NONE** |
| Database write | **NO** |
| Backup triggered | **NO** |
| Restore triggered | **NO** |
| Logical backup / `pg_dump` | **NO** |
| PITR enabled | **NO** |
| Plan / backup settings changed | **NO** |
| Worker pause | **NO** |
| Webhook gating | **NO** |
| Resolver flag enablement | **NO** |
| E4B started | **NO** |
| Activation replay | **NO** |
| RETRY-5 token accessed | **NO** |
| New Supabase access token created | **NO** |

---

## 14. Final decision

**PASS WITH NOTES — BACKUP/PITR RESTORE POINT VERIFIED FOR E4B PLANNING**

### Notes / residual risks

1. **PITR disabled** — no continuous or sub-minute recovery point; daily **~24h RPO** applies.
2. **Post-backup database commits would be lost** if the database is restored to a selected snapshot.
3. **Backups before 2026-07-01** may revert credential/activation state (pre-RETRY-5); must not be used as credential-safe rollback without separate proof.
4. **Execution-day backup metadata must be revalidated** after approved write freeze.
5. **Worker pause and webhook ingress gating** still require independent review before E4B.
6. **E4A PR #302** assessment review remains unresolved.
7. **E4B explicit authorization** is still absent.
8. **Optional fresh logical backup** remains a separate gate if recovery closer than ~24 hours is required.

### Current gate

**HOLD — E4B PENDING INDEPENDENT REVIEW, EXECUTION-DAY BACKUP REVALIDATION, INGRESS-GATING READINESS AND EXPLICIT GO**

### Recommended next controlled gate

**E4B authorization package** after: (a) E4A evidence PR #302 independent review, (b) E4A-C evidence acceptance, (c) explicit controller GO including worker pause / webhook gating runbook and execution-day backup revalidation.
