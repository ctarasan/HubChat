# IG-AUTH-2E.6G Production Migration History Reconciliation Audit

> **Agent:** A
> **Date:** 2026-06-21 (correct-target rerun)
> **Branch:** `docs/ig-auth-2e-6g-migration-history-audit`
> **PR:** [#264](https://github.com/ctarasan/HubChat/pull/264)
> **Base master SHA:** `98672c98056bc031188966a464478ae89b0f027c`
> **Authorization:** Read-only audit (operator-confirmed CLI link + dry-run on SmartKorp production)
> **Companion:** [`ig-auth-2e-6-production-migration-history-reconciliation-plan.md`](../../instagram/ig-auth-2e-6-production-migration-history-reconciliation-plan.md)

---

## Summary

Read-only audit of all **25** local Supabase migrations against **SmartKorp production** (`dsky…hyx`). Initial PR commit audited the **wrong linked project** (`Cursor_App` / `cawt…nkto`); this document preserves that history and adds a **correct-target rerun** with `pg_catalog` evidence.

**Key findings (SmartKorp production):**

- `supabase_migrations.schema_migrations` **does not exist** — CLI remote history blank for all 25 versions; dry-run would push all 25.
- **21 migrations** verified **PRESENT_EQUIVALENT** or **DATA_STATE_CONFIRMED** via Postgres probes.
- **4 migrations MISSING:** `20260620120000` (2C states table), IG OAuth trio (`20260621120000`, `20260621130000`, `20260621140000`).
- Legacy **`20260430` shared version** collision unresolved for CLI history repair (both effects live in DB).
- Minor note: `claim_queue_jobs` retains legacy 2-arg overload alongside intended 3-arg version.

**Decision: READY_FOR_INDEPENDENT_REVIEW**

---

## Wrong-target audit history

Initial commit `b7be939` (PR #264) ran CLI and schema probes against an incorrectly linked project:

| Field | Wrong target |
| --- | --- |
| Project name | `Cursor_App` |
| Ref (masked) | `cawt…nkto` |
| Capture UTC | `2026-06-21T05:59:26Z` |
| Verdict | **WRONG TARGET** |

Wrong-target probe results (retained for audit trail):

| Probe | Wrong-target result |
| --- | --- |
| `schema_migrations` | Absent |
| `conversations`, `queue_jobs` | Absent |
| Outbound RPC | 0 overloads |
| Core Phase II schema | Absent |
| Only partial tables | `channel_connections`, `channel_credentials`, `channel_settings`, `oauth_transactions` |

That pass correctly identified a linked-project identity gap but **must not** be used for SmartKorp reconciliation decisions. Prior SmartKorp PostgREST probes (IG-AUTH-2E.5A/2E.6E) remain valid supplemental evidence.

---

## Correct production target verification

| Field | Value |
| --- | --- |
| Project | SmartKorp production (`SmartKorp Hub Chat`) |
| Ref (masked) | `dsky…hyx` |
| Verified via | `supabase/.temp/linked-project.json` name + ref prefix/suffix match to Vercel production `SUPABASE_URL` |
| Full ref committed | **No** |
| Correct production target verified | **YES** |

---

## Correct-target migration list

Executed 2026-06-21 on SmartKorp production:

```text
supabase migration list --linked     → SUCCESS
Remote column:                       blank for all 25 local versions
```

| Local version | Remote | Notes |
| --- | --- | --- |
| `20260430` (×2) | blank | Duplicate version prefix |
| `20260506` … `20260621140000` | blank | All blank |

`supabase_migrations.schema_migrations`: **`to_regclass` → null** (table does not exist).

---

## Correct-target dry-run

```text
supabase db push --linked --dry-run    → SUCCESS
Would push:                            all 25 migration files
Production mutation:                   NONE
```

**Before history repair:** dry-run pending = all 25 files.

**After history repair (target end state):**

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

---

## Correct-target schema probe summary

Captured UTC `2026-06-21T06:17:45Z` via read-only `supabase db query --linked` on SmartKorp production:

| Probe | Result |
| --- | --- |
| Outbound RPC overload count | **1** |
| Outbound RPC args | 15 params incl. `p_conversation_ids jsonb`; **no** `p_instagram_credential_binding` |
| `p_conversation_ids` in signature | **Yes** (`conv_ids_param_rpc` = 1) |
| FB reclassify residual count | **0** |
| `claim_queue_jobs` | 2 overloads: 2-arg legacy + 3-arg with timeout |
| Phase II conversation columns | All 11 expected columns present |
| `conversation_events` table | Present |
| Enums `conversation_status`, `lead_status` | RESOLVED/ARCHIVED/UNQUALIFIED present |
| Marketing bridge + retention + SLA | Tables/columns present |
| `instagram_oauth_credentials` | Table present |
| `instagram_oauth_states` | **Absent** (table count 0) |
| IG identity columns | **Absent** |
| IG binding RPC param | **Absent** |
| Queue outbound PENDING / PROCESSING | **0 / 0** |

---

## 25-migration production audit matrix

Evidence from SmartKorp `pg_catalog` / `information_schema` probes unless noted.

| Version | Filename | Type | Expected effect | Production evidence | Classification | Safe to mark applied later | Real execution required | Engineering/reconciliation required | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20260430 | add_conversation_ids_to_outbound_function | FUNCTION | Add `p_conversation_ids` to outbound RPC | `pg_proc`: 15-arg signature incl. `p_conversation_ids jsonb`; overload count 1 | **PRESENT_EQUIVALENT** | Yes | No | No | Low | Do not re-apply blindly |
| 20260430 | reclassify_invalid_facebook_dm_threads | DATA | Reclassify mis-tagged FB threads | Residual misclassified count = **0** | **DATA_STATE_CONFIRMED** | Yes | No | Shared version repair only | Low | Idempotent re-run safe |
| 20260506 | instagram_provider_thread_and_indexes | MIXED | INSTAGRAM_DM constraint + indexes | Constraint includes INSTAGRAM_DM; 3 indexes present | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260509000100 | reclaim_stuck_processing_queue_jobs | FUNCTION | `claim_queue_jobs` with timeout reclaim | 3-arg overload present; legacy 2-arg also exists | **PRESENT_EQUIVALENT** | Yes | No | Optional: drop legacy 2-arg overload | Low | Dual overload non-blocking |
| 20260512120000 | phase_ii_a1_conversation_foundation | MIXED | Conversation lifecycle cols + events | 11 cols + `conversation_events` table | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260512180000 | phase_ii_c1_status_enums | ENUM | RESOLVED/ARCHIVED + UNQUALIFIED | Enum labels confirmed | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260513120000 | phase_ii_d1_a_team_member_foundation | MIXED | Sales agent assignment cols | 4 cols + `sales_assignment_mode` enum | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260514120000 | phase_ii_c2_a_conversation_follow_up | COLUMN | `follow_up_at`, `follow_up_note` | Columns in conversations | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260519120000 | phase_ii_c3_conversation_resolved_at | MIXED | `resolved_at` + enum idempotency | `resolved_at` present | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260520120000 | phase_ii_g1_a_channel_settings | MIXED | `channel_settings` table | Table exists | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260526120000 | phase_ii_m1_a_marketing_events | MIXED | `marketing_events` + RLS | Table exists; RLS enabled | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260527120000 | phase_ii_m2_b_marketing_automation_bridge_outbox | MIXED | Bridge outbox + claim fn | Table + `claim_marketing_automation_bridge_outbox` | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260530120000 | phase_ii_retention_purge_runs | MIXED | Retention audit table | Table exists | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260531120000 | phase_ii_retention_purge_execute | MIXED | Retention execute columns | 5 execution columns present | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260601120000 | phase_ii_sla1_tenant_sla_policies | TABLE | `tenant_sla_policies` | Table exists | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260602120000 | phase_ii_profile_avatar_cache | COLUMN | Avatar cache columns | 4 `profile_image_*` cols (+ legacy `profile_image_url`) | **PRESENT_EQUIVALENT** | Yes | No | No | Low | Extra legacy col OK |
| 20260602154000 | instagram_comment_provider_thread_type | CONSTRAINT | INSTAGRAM_COMMENT in check | Constraint def includes INSTAGRAM_COMMENT | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260604120000 | ccp_1_channel_connection_foundation | MIXED | CCP tables + enums | Tables + `channel_connection_status` enum | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260608120000 | ccw_1a_conversation_channel_connection_id | MIXED | `channel_connection_id` + indexes | Column + `idx_conversations_channel_connection` | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260614120000 | fb_oauth_1b_oauth_transactions | MIXED | `oauth_transactions` + enum | Table + enum present | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260619120000 | ig_auth_2a_instagram_oauth_credential_foundation | MIXED | `instagram_oauth_credentials` + enums | Table + `instagram_oauth_credential_status` enum | **PRESENT_EQUIVALENT** | Yes | No | No | Low | |
| 20260620120000 | ig_auth_2c_instagram_oauth_states | MIXED | `instagram_oauth_states` + enum | Table count **0**; enum count **0** | **MISSING** | No | **Yes** | No | High | Required before OAuth connect flow |
| 20260621120000 | ig_auth_2d_instagram_oauth_identity_verification | MIXED | Identity verification columns | Identity cols null; constraint absent | **MISSING** | No | **Yes** | No | High | |
| 20260621130000 | ig_auth_2e3_outbound_instagram_binding | FUNCTION | `p_instagram_credential_binding` param | Binding param count **0** | **MISSING** | No | **Yes** | No | **Critical** | APP-before-DB risk |
| 20260621140000 | ig_auth_2d_instagram_oauth_identity_reconcile | MIXED | Idempotent 2D reconcile | Same as 2D — cols absent | **MISSING** | No | **Yes** | No | Medium | Idempotent with 2D |

**Classification totals (SmartKorp production, verified):**

| Classification | Count |
| --- | ---: |
| PRESENT_EQUIVALENT | 20 |
| DATA_STATE_CONFIRMED | 1 |
| MISSING | 4 |
| PRESENT_DIVERGENT | 0 |
| DATA_STATE_UNKNOWN | 0 |

---

## Legacy 20260430 assessment

| Question | Finding |
| --- | --- |
| Function effect present? | **Yes** — `pg_proc` shows 15-param signature with `p_conversation_ids jsonb` |
| Signature/body equivalent? | **Equivalent for intended effect** — matches pre-binding migration; no binding param (expected; 2E.3 separate) |
| Data reclassification proven? | **Yes** — residual count = 0 |
| How applied historically? | Outside CLI tracking — `schema_migrations` table absent |
| Shared version reconciliation | **Unresolved** — two files share `20260430`; CLI cannot record both without repair strategy |
| Unique reconciliation migration needed? | **Yes (recommended)** — Option B: preserve filenames; add new unique version documenting both effects as applied |

**Proposed options (PROPOSED ONLY — NOT AUTHORIZED):**

| Option | Recommendation |
| --- | --- |
| **A** Rename one legacy file + idempotent reconciliation | Engineering review |
| **B** Keep filenames; add unique reconciliation migration | **Preferred** |
| **C** Mark one version applied + new reconciliation | High operator risk |
| **D** HOLD on data state | **No longer required** — data state confirmed |

---

## IG OAuth trio assessment

| Version | Expected | SmartKorp evidence | Classification |
| --- | --- | --- | --- |
| `20260621120000` | 2D identity columns + check | `ig_identity_cols` null; constraint count 0 | **MISSING** |
| `20260621130000` | Binding RPC parameter | `binding_param_rpc` = 0; 15-arg RPC only | **MISSING** |
| `20260621140000` | Idempotent 2D reconcile | Same absence as 2D | **MISSING** |

**Additional finding:** `20260620120000` (2C `instagram_oauth_states`) is also **MISSING** — not part of trio label but in must-execute set.

---

## Reconciliation groups

| Group | Versions | Count |
| --- | --- | ---: |
| **A — Verified safe mark-applied** | 20260430 (both files), 20260506–20260619120000 | 21 |
| **B — Must execute real migration** | 20260620120000, 20260621120000, 20260621130000, 20260621140000 | 4 |
| **C — Idempotent reconciliation migration** | Legacy `20260430` CLI collision (Option B new unique version) | 1 (proposed) |
| **D — Unknown / operator decision** | None | 0 |
| **E — Divergence / engineering fix** | `claim_queue_jobs` dual overload (optional cleanup) | 0 blocking |

---

## Proposed history reconciliation plan

See companion doc for full sequence. Summary:

1. Independent review of Group A repair list (21 versions).
2. Engineering: add unique `20260430` reconciliation migration (Option B) if repair cannot represent both files.
3. Operator approval: `GO MIGRATION HISTORY RECONCILIATION`.
4. `migration repair` verified Group A versions only (**PROPOSED ONLY — NOT AUTHORIZED**).
5. Re-run `migration list` + `db push --dry-run`; require pending = **4 files** above.
6. Separate `GO MIGRATION WINDOW` for Group B execution.

---

## Stop conditions

| # | Condition | Status |
| --- | --- | --- |
| 1 | CLI linked to SmartKorp production | **Clear** |
| 2 | SmartKorp `pg_catalog` audit complete | **Clear** |
| 3 | 20260430 data state confirmed | **Clear** (residual 0) |
| 4 | Dry-run after repair = 4 pending files | **Pending repair** (not executed) |
| 5 | Active outbound queue backlog | **Clear** (0/0) |
| 6 | Legacy `20260430` version collision | **Still unresolved** — blocks repair until Option B reviewed |

---

## Decision

**READY_FOR_INDEPENDENT_REVIEW**

Audit evidence on the correct production target is sufficient for independent review of the repair candidate list and legacy collision remediation. Execution remains **HOLD** until `GO MIGRATION HISTORY RECONCILIATION` and separate `GO MIGRATION WINDOW`.

---

## Required attestation

```text
Correct production target verified: YES
Production migration list read: YES
Production dry-run performed: YES
Production migration executed: NONE
Migration repair executed: NONE
Migration-history edits: NONE
DDL/data writes: NONE
Queue mutations: NONE
Environment changes: NONE
Deployments: NONE
Provider calls: NONE
Outbound messages: NONE
```

---

## Security sanitization

- No full project refs, database URLs, service keys, JWTs, or tokens committed
- No message content, raw payloads, credentials, signed URLs, or external IDs queried
- Aggregate counts and catalog metadata only
- Temporary audit scripts/output **not** included in PR

---

## Completion report

```text
Branch: docs/ig-auth-2e-6g-migration-history-audit
Commit: (this update)
PR: #264
Base master SHA: 98672c98056bc031188966a464478ae89b0f027c
Execution timestamp: 2026-06-21 ~13:20 +07 (correct-target rerun)

Supabase CLI version: 2.98.2
Linked project (correct): SmartKorp Hub Chat (dsky…hyx)
Wrong-target history: Cursor_App (cawt…nkto) — retained in §Wrong-target audit history

Total migrations audited: 25
PRESENT_EQUIVALENT: 20
DATA_STATE_CONFIRMED: 1
MISSING: 4
PRESENT_DIVERGENT: 0
DATA_STATE_UNKNOWN: 0

Legacy 20260430: function equivalent + data confirmed; version collision unresolved
IG OAuth trio: all MISSING; 2C states table also MISSING

Safe candidates to mark applied: 21
Must execute: 4 (20260620120000 + IG trio)
Needs reconciliation migration: legacy 20260430 CLI collision (Option B)
Unknown/manual decision: none

Production writes: NONE
Migration execution: NONE
Migration repair: NONE
History edits: NONE
Environment changes: NONE
Deployments: NONE
Provider calls: NONE
Outbound messages: NONE

Decision: READY_FOR_INDEPENDENT_REVIEW
Next approval: independent review → GO MIGRATION HISTORY RECONCILIATION → GO MIGRATION WINDOW

Scope confirmation:
IG-AUTH-2E.6G read-only production migration-history audit only.
No migration execution. No migration repair or remote history edits.
No DDL or data writes. No queue/environment mutation.
No deployment. No provider calls or outbound messages. No merge performed.
```
