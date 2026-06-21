# IG-AUTH-2E.6G Production Migration History Reconciliation Audit

> **Agent:** A
> **Date:** 2026-06-21
> **Branch:** `docs/ig-auth-2e-6g-migration-history-audit`
> **Base master SHA:** `98672c98056bc031188966a464478ae89b0f027c`
> **Authorization:** Read-only audit (operator-confirmed CLI link + dry-run baseline)
> **Companion:** [`ig-auth-2e-6-production-migration-history-reconciliation-plan.md`](../../instagram/ig-auth-2e-6-production-migration-history-reconciliation-plan.md)

---

## Summary

Read-only audit comparing all **25** local Supabase migrations against production evidence. CLI `migration list` and `db push --dry-run` executed on the **linked** project; schema probes executed via `supabase db query --linked` (read-only transactions).

**Critical finding:** The locally linked Supabase project (`Cursor_App`, ref masked `cawt…nkto`) is **not** SmartKorp production (`dsky…hyx`, confirmed in IG-AUTH-2E.5A/2E.6E PostgREST probes). Dry-run and empty remote history apply to the linked project only. SmartKorp production classification relies on prior authorized read-only evidence plus inferred mature-state signals (live queue/outbox, OAuth tables, OpenAPI RPC introspection).

**Decision: HOLD — INSUFFICIENT_EVIDENCE**

Cannot certify migration-history reconciliation until the operator links CLI (or supplies `DATABASE_URL`) to **SmartKorp production** and re-runs list, dry-run, and `pg_catalog` probes there.

---

## Production baseline

| Plane | Project | Ref (masked) | Evidence source |
| --- | --- | --- | --- |
| **SmartKorp production (target)** | Production Supabase | `dsky…hyx` | IG-AUTH-2E.5A/2E.6E PostgREST + Vercel `SUPABASE_URL` host match |
| **CLI linked project (actual)** | `Cursor_App` | `cawt…nkto` | `supabase/.temp/linked-project.json`, `migration list --linked`, `db query --linked` |

| Check | SmartKorp production | CLI linked (`Cursor_App`) |
| --- | --- | --- |
| `supabase_migrations.schema_migrations` | Not queried via Postgres in this phase; history **unknown/untracked** per prior phases | **Absent** (`to_regclass` → null) |
| Remote migration history (CLI) | **Not linked** in this session | **Empty** for all 25 local versions |
| Core app tables (`conversations`, `queue_jobs`, `messages`) | **Present** (2E.5A queue/outbox counts) | **Absent** (query errors / not in core_tables probe) |
| Partial OAuth/CCP tables | Full mature set inferred | Only `channel_connections`, `channel_credentials`, `channel_settings`, `oauth_transactions` |
| Outbound RPC | **Present** (OpenAPI); binding param **absent** | **Absent** (`overload_count` 0) |
| IG OAuth identity columns | **Absent** (2E.5A) | **Absent** (`ig_identity_cols` null) |
| Production mutation this phase | **NONE** | **NONE** |

---

## Dry-run result

Executed 2026-06-21 on **linked** project (`Cursor_App`):

```text
supabase migration list --linked     → SUCCESS (remote column empty for all 25)
supabase db push --linked --dry-run    → SUCCESS (would push all 25 files)
Production writes                      → NONE
```

Pending set (alphabetical within shared `20260430` prefix):

```text
20260430_add_conversation_ids_to_outbound_function.sql
20260430_reclassify_invalid_facebook_dm_threads.sql
20260506_instagram_provider_thread_and_indexes.sql
… (22 more through) …
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

**Interpretation:** On `Cursor_App`, the database behaves like a **greenfield/partial** schema with **no Supabase migration history tracking**. Dry-run would attempt to apply the entire repository chain. This result **must not** be treated as SmartKorp production pending state.

---

## CLI schema probe summary (linked project only)

Captured UTC `2026-06-21T05:59:26Z` via read-only `supabase db query --linked`:

| Probe | Result |
| --- | --- |
| `schema_migrations` table | **Missing** |
| `queue_jobs` | **Missing** (relation error) |
| `conversations` | **Missing** (relation error) |
| `create_outbound_message_with_outbox` | **Missing** (0 overloads) |
| `p_conversation_ids` in RPC args | **0** |
| `p_instagram_credential_binding` | **0** |
| `claim_queue_jobs` | **0** |
| `claim_marketing_automation_bridge_outbox` | **0** |
| `channel_connection_status` enum | **Present** (1 type) |
| `oauth_transaction_status` enum | **Present** (1 type) |
| `instagram_oauth_credential_status` enum | **Missing** (0 types) |
| Phase II conversation foundation columns | **Missing** (no `conversations` table) |
| FB reclass residual count | **Not runnable** (no `conversations`) |

---

## 25-migration audit matrix (SmartKorp production classification)

Classifications use SmartKorp production as the rollout target. Evidence codes:

- **SK** — prior SmartKorp PostgREST / authorized read-only probes (2E.5A, 2E.6E)
- **INF** — inferred from live production behavior (outbox dispatched, OAuth foundation counts)
- **CLI** — linked-project probe (wrong project; corroborates greenfield only)
- **UNK** — insufficient Postgres session on SmartKorp

| Version | Filename | Type | Expected effect (summary) | Production evidence | Classification | Safe to mark applied later | Actual execution required | Reconciliation migration | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20260430 | add_conversation_ids_to_outbound_function | FUNCTION | Adds `p_conversation_ids jsonb` to outbound RPC | SK: RPC live; OpenAPI pre-binding signature | **PRESENT_EQUIVALENT** (INF) | Yes, after `pg_proc` verify on SmartKorp | No, if equivalent confirmed | No | Low | Do not re-`CREATE OR REPLACE` blindly |
| 20260430 | reclassify_invalid_facebook_dm_threads | DATA | Reclassify mis-tagged FB threads to FACEBOOK_COMMENT | UNK: no SmartKorp aggregate in this phase | **DATA_STATE_UNKNOWN** | No | Unknown | Maybe idempotent re-run | Medium | Legacy duplicate version |
| 20260506 | instagram_provider_thread_and_indexes | MIXED | INSTAGRAM_DM constraint + indexes | INF: live IG inbound/outbound | **PRESENT_EQUIVALENT** (INF) | Yes, after index/constraint verify | No | No | Low | |
| 20260509000100 | reclaim_stuck_processing_queue_jobs | FUNCTION | `claim_queue_jobs` with stale reclaim | INF: worker queue processing live | **PRESENT_EQUIVALENT** (INF) | Yes, after `pg_proc` verify | No | No | Low | |
| 20260512120000 | phase_ii_a1_conversation_foundation | MIXED | Conversation lifecycle columns + `conversation_events` | INF: Team Inbox / SLA features live | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260512180000 | phase_ii_c1_status_enums | ENUM | RESOLVED/ARCHIVED + UNQUALIFIED | INF: status flows live | **PRESENT_EQUIVALENT** (INF) | Yes, after enum verify | No | No | Low | |
| 20260513120000 | phase_ii_d1_a_team_member_foundation | MIXED | Sales agent assignment columns | INF: assignment features in app | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260514120000 | phase_ii_c2_a_conversation_follow_up | COLUMN | `follow_up_at`, `follow_up_note` | INF: follow-up UI live | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260519120000 | phase_ii_c3_conversation_resolved_at | MIXED | `resolved_at` + enum idempotency | INF: resolved lifecycle live | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260520120000 | phase_ii_g1_a_channel_settings | MIXED | `channel_settings` table | INF: channel settings in prod | **PRESENT_EQUIVALENT** (INF) | Yes, after table verify | No | No | Low | |
| 20260526120000 | phase_ii_m1_a_marketing_events | MIXED | `marketing_events` + RLS | INF: marketing bridge live | **PRESENT_EQUIVALENT** (INF) | Yes, after table verify | No | No | Low | |
| 20260527120000 | phase_ii_m2_b_marketing_automation_bridge_outbox | MIXED | Bridge outbox + claim function | INF: bridge worker path exists | **PRESENT_EQUIVALENT** (INF) | Yes, after table/fn verify | No | No | Low | |
| 20260530120000 | phase_ii_retention_purge_runs | MIXED | Retention dry-run audit table | INF: retention UI/API referenced | **PRESENT_EQUIVALENT** (INF) | Yes, after table verify | No | No | Low | |
| 20260531120000 | phase_ii_retention_purge_execute | MIXED | Retention execute columns/status | INF: execute path in repo | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260601120000 | phase_ii_sla1_tenant_sla_policies | TABLE | `tenant_sla_policies` | INF: SLA policy feature merged | **PRESENT_EQUIVALENT** (INF) | Yes, after table verify | No | No | Low | |
| 20260602120000 | phase_ii_profile_avatar_cache | COLUMN | Avatar cache columns on `contact_identities` | INF: avatar cache code paths | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260602154000 | instagram_comment_provider_thread_type | CONSTRAINT | INSTAGRAM_COMMENT in check | INF: IG comment threads in prod | **PRESENT_EQUIVALENT** (INF) | Yes, after constraint verify | No | No | Low | |
| 20260604120000 | ccp_1_channel_connection_foundation | MIXED | `channel_connections` / `channel_credentials` | SK/INF: CCP live; CLI partial tables | **PRESENT_EQUIVALENT** (INF) | Yes, after enum/table verify | No | No | Low | |
| 20260608120000 | ccw_1a_conversation_channel_connection_id | MIXED | `channel_connection_id` FK + indexes | INF: CCW routing live | **PRESENT_EQUIVALENT** (INF) | Yes, after column verify | No | No | Low | |
| 20260614120000 | fb_oauth_1b_oauth_transactions | MIXED | `oauth_transactions` + enum | SK/INF: FB OAuth path; CLI has table | **PRESENT_EQUIVALENT** (INF) | Yes, after table verify | No | No | Low | |
| 20260619120000 | ig_auth_2a_instagram_oauth_credential_foundation | MIXED | `instagram_oauth_credentials` + enums | SK: table exists, 0 rows | **PRESENT_EQUIVALENT** | Yes, after table verify | No | No | Low | |
| 20260620120000 | ig_auth_2c_instagram_oauth_states | MIXED | `instagram_oauth_states` + enum | INF: OAuth state code merged | **PRESENT_EQUIVALENT** (INF) | Yes, after table verify | No | No | Low | |
| 20260621120000 | ig_auth_2d_instagram_oauth_identity_verification | MIXED | Identity verification columns | SK: columns **absent** | **MISSING** | No | **Yes** | No (or via 20260621140000) | High | Blocks IG identity verification |
| 20260621130000 | ig_auth_2e3_outbound_instagram_binding | FUNCTION | `p_instagram_credential_binding` RPC param | SK: OpenAPI param **absent** | **MISSING** | No | **Yes** | No | **Critical** | APP-before-DB risk at deployed SHA |
| 20260621140000 | ig_auth_2d_instagram_oauth_identity_reconcile | MIXED | Idempotent 2D column reconcile | SK: columns **absent** | **MISSING** | No | **Yes** (idempotent) | No | Medium | Safe after 2D/2E.3 ordering review |

**Classification totals (SmartKorp target, evidence-weighted):**

| Classification | Count |
| --- | ---: |
| PRESENT_EQUIVALENT | 21 |
| PRESENT_DIVERGENT | 0 |
| MISSING | 3 |
| DATA_STATE_CONFIRMED | 0 |
| DATA_STATE_UNKNOWN | 1 |

---

## Legacy 20260430 analysis

| Question | Finding |
| --- | --- |
| Function effect present? | **Likely yes** on SmartKorp (live outbound RPC; pre-binding 15-param OpenAPI). Not verified via `pg_proc` on SmartKorp in this phase. |
| Signature/body equivalent? | **Unknown** — requires SmartKorp `pg_get_function_identity_arguments` compare. Linked DB has **no** RPC at all. |
| Data reclassification evidence? | **DATA_STATE_UNKNOWN** — residual-count query not executed on SmartKorp Postgres. |
| How applied historically? | **Unknown** — no `schema_migrations` row evidence; likely manual/SQL-editor apply outside CLI tracking. |
| Shared version reconciliation | **Unresolved** — two files share prefix `20260430`; CLI cannot record both under one version key without repair strategy. |

**Proposed options (NOT AUTHORIZED):**

| Option | Description | Recommendation |
| --- | --- | --- |
| **A** | Rename one legacy file + idempotent reconciliation migration | Engineering review required |
| **B** | Preserve filenames; add new unique reconciliation migration | **Preferred** if history repair is authorized |
| **C** | Mark one version applied + new reconciliation migration | High operator risk |
| **D** | **HOLD** — data state cannot be proven | **Current stance** for reclassify file |

---

## IG OAuth trio

| Version | Expected | Actual (SmartKorp) | Classification |
| --- | --- | --- | --- |
| `20260621120000` | 2D identity columns + constraint | Columns **absent** (2E.5A) | **MISSING** |
| `20260621130000` | `p_instagram_credential_binding` | OpenAPI param **absent** | **MISSING** |
| `20260621140000` | Idempotent 2D reconcile | Columns **absent** | **MISSING** |

All three remain in the **must execute** set for SmartKorp regardless of linked-project dry-run.

---

## Reconciliation groups (proposed)

| Group | Versions | Rationale |
| --- | --- | --- |
| **A — Safe mark-applied candidates** | 20260506–20260620120000 (19) + likely 20260430 function | Inferred live on SmartKorp; require SmartKorp `pg_proc`/catalog proof before any `migration repair` |
| **B — Must execute** | 20260621120000, 20260621130000, 20260621140000 | Confirmed missing effects |
| **C — Idempotent reconciliation** | 20260621140000 (also satisfies 2D if 20260621120000 skipped) | Designed idempotent |
| **D — Unknown / manual** | 20260430 reclassify | DATA_STATE_UNKNOWN |
| **E — Engineering fix** | Shared `20260430` version collision | LEGACY_COLLISION_UNRESOLVED |

---

## Stop conditions

Do **not** proceed to `GO MIGRATION HISTORY RECONCILIATION` while any of the following hold:

1. CLI linked project ≠ SmartKorp production (`dsky…hyx`)
2. SmartKorp `pg_proc` verification not completed for FUNCTION migrations
3. 20260430 data migration state unconfirmed
4. Dry-run on SmartKorp does not match expected pending set `{20260621120000, 20260621130000, 20260621140000}` **after** history repair (not before)
5. Active outbound queue backlog or OAuth-bound jobs (currently 0 per 2E.5A; re-verify at window)

---

## Security sanitization

- No database URLs, service keys, JWTs, tokens, or env dumps committed
- Project refs masked (`dsky…hyx`, `cawt…nkto`)
- No message content, payloads, credentials, or customer identifiers queried
- Temporary audit script/output **not** included in PR (docs-only)

---

## Completion report

```text
Branch: docs/ig-auth-2e-6g-migration-history-audit
Commit: (pending)
PR: (pending)
Base master SHA: 98672c98056bc031188966a464478ae89b0f027c
Execution timestamp: 2026-06-21 ~13:00 +07

Supabase CLI version: 2.98.2
Linked project: Cursor_App (cawt…nkto) — NOT SmartKorp production
SmartKorp production ref: dsky…hyx (PostgREST baseline)

migration list --linked: SUCCESS (remote empty ×25)
db push --dry-run --linked: SUCCESS (would push all 25)
supabase db query --linked: SUCCESS (read-only probes)
Production mutation: NONE

Total migrations audited: 25
PRESENT_EQUIVALENT: 21 (SmartKorp inferred + SK probes)
PRESENT_DIVERGENT: 0
MISSING: 3 (IG OAuth trio)
DATA_STATE_CONFIRMED: 0
DATA_STATE_UNKNOWN: 1 (20260430 reclassify)

Legacy 20260430 result: FUNCTION likely equivalent (unverified pg_proc); DATA unknown; version collision unresolved
IG OAuth trio result: all MISSING on SmartKorp

Safe candidates to mark applied: 19–21 (after SmartKorp catalog verify)
Must execute: 20260621120000, 20260621130000, 20260621140000
Needs reconciliation migration: 20260430 pair (engineering)
Needs engineering fix: shared 20260430 version key
Unknown/manual decision: 20260430 reclassify data state

Production writes: NONE
Migration execution: NONE
Migration repair: NONE
History edits: NONE
Environment changes: NONE
Deployments: NONE
Provider calls: NONE
Outbound messages: NONE

Security scan: pending (pre-commit)
Blocking findings:
- LINKED_PROJECT_NOT_SMARTKORP_PRODUCTION
- SMARTKORP_PG_CATALOG_NOT_QUERIED
- LEGACY_20260430_DATA_STATE_UNKNOWN
- schema_migrations absent on linked project

Decision: HOLD — INSUFFICIENT_EVIDENCE
Next approval required:
1. Operator re-link CLI to SmartKorp production (dsky…hyx) OR supply DATABASE_URL
2. Re-run migration list + dry-run on correct project
3. Execute SmartKorp read-only pg_catalog audit
4. Then GO MIGRATION HISTORY RECONCILIATION (separate approval)

Scope confirmation:
IG-AUTH-2E.6G read-only production migration-history audit only.
No migration execution. No migration repair or remote history edits.
No DDL or data writes. No queue/environment mutation.
No deployment. No provider calls or outbound messages. No merge performed.
```
