# IG-AUTH-2E.6U — Real-Execution Readiness Plan

> **Agent:** A
> **Date:** 2026-06-22
> **Task:** IG-AUTH-2E.6U
> **Type:** Planning document only — **no database commands authorized or executed**

---

## Summary

This document closes Agent B review blockers on PR #274 by providing per-migration execution analysis, rollback/forward-fix plans, pre-execution gates, maintenance-window assessment, exact post-execution verification queries, production smoke checklist, and stop conditions.

**Real execution is NOT authorized.** Awaiting:

```text
GO REAL DB PUSH LINKED — FIVE MIGRATIONS
```

---

## Reference state

| Field | Value |
| --- | --- |
| Approved master SHA | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| Dry-run evidence SHA | `3dfc098de8d30f30d9aed739d84d40c86060dee8` |
| CLI version (dry-run) | `2.98.2` |
| Repaired history version | `20260501120000` => applied |
| Dry-run result | PASS — exactly 5 migrations proposed in order |

### Pending migrations (execution order)

| # | Version | Filename | SHA-256 |
| --- | --- | --- | --- |
| 1 | `20260620120000` | `20260620120000_ig_auth_2c_instagram_oauth_states.sql` | `b4ddab7340da03faab4b2eee7c082a1c3bc4951c06d681b22be876acf6107834` |
| 2 | `20260621120000` | `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` | `faffa882f0b051138658e6d133ce4eeeda6e133f8cf1a2a3e70b34d0548b050e` |
| 3 | `20260621130000` | `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` | `0db03064e0283c29f8f089529c6634c51cc91618a2d6fe2b5f1ff67a6fde7068` |
| 4 | `20260621140000` | `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` | `83a7958b93b4d42381d2020547652c7618a8e84890ab006ef816aafd81cdb04e` |
| 5 | `20260621150000` | `20260621150000_legacy_20260430_reconciliation.sql` | `c809c8f38c0170392b49e7626a00dd2c20c4e622c81ca2b2f5e0d2f472eff880` |

### Authorized real-execution command (not yet approved)

```bash
supabase db push --linked
```

**Prohibited without separate authorization:** `--include-all`, `--include-seed`, `--include-roles`, repair, rerun dry-run, automatic retry after failure.

---

## Part C — Per-migration execution analysis

### Migration 1: `20260620120000`

| Field | Detail |
| --- | --- |
| **Filename** | `20260620120000_ig_auth_2c_instagram_oauth_states.sql` |
| **Purpose** | Persist Instagram OAuth state rows for Business Login connect flow (IG-AUTH-2C) |
| **Objects affected** | Enum `public.instagram_oauth_state_status`; table `public.instagram_oauth_states`; indexes `idx_instagram_oauth_states_state_hash` (unique), `idx_instagram_oauth_states_tenant`, `idx_instagram_oauth_states_connection`, `idx_instagram_oauth_states_expires_at` |
| **DDL/DML** | `DO $$ … CREATE TYPE … EXCEPTION duplicate_object`; `CREATE TABLE IF NOT EXISTS`; four `CREATE INDEX IF NOT EXISTS`; `NOTIFY pgrst, 'reload schema'` |
| **Dependencies** | `channel_type` enum; `channel_connections (tenant_id, id)` FK; `sales_agents` referenced only by column type (no FK in file) |
| **RLS/policies** | None in migration file |
| **Transaction boundary** | Single `begin;` … `commit;` wrapping all statements |
| **Lock assessment** | `CREATE TYPE` — brief catalog lock; `CREATE TABLE IF NOT EXISTS` — metadata lock if table absent; index builds on empty table — fast; FK validation against `channel_connections` — catalog read |
| **Lock duration** | Expected seconds on empty/new table |
| **Atomicity / partial risk** | If failure mid-transaction, entire migration rolls back (explicit transaction). `CREATE TYPE` uses duplicate_object handler — rerunnable for type. Table/index `IF NOT EXISTS` — rerunnable |
| **Idempotency** | High — duplicate-safe type creation, IF NOT EXISTS table/indexes |
| **Destructive ops** | None |
| **Expected rows affected** | 0 data rows (new empty table) |
| **Pre-execution verification** | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='instagram_oauth_states'` — expect 0; `SELECT count(*) FROM instagram_oauth_states` — expect 0 if table exists empty; `SELECT to_regtype('public.instagram_oauth_state_status')` — may be null pre-migration |
| **Post-execution verification** | Table exists; enum exists; four indexes exist; FK `instagram_oauth_states_tenant_connection_fk` present; row count = 0 |
| **Rollback strategy** | Do not DROP in production. If failure before commit — automatic rollback. If committed but app broken — forward-fix only; table is additive and unused until OAuth connect ships |
| **Forward-fix strategy** | Fix application/config; table can remain empty |
| **Operator stop criteria** | Stop if `instagram_oauth_states` already has production rows; stop if `channel_connections` missing; stop if enum/table exists with incompatible definition |

---

### Migration 2: `20260621120000`

| Field | Detail |
| --- | --- |
| **Filename** | `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` |
| **Purpose** | Add verified identity metadata columns on `instagram_oauth_credentials` (IG-AUTH-2D) |
| **Objects affected** | Table `public.instagram_oauth_credentials`; columns `verified_username`, `verified_account_type`, `identity_verified_at`; constraint `instagram_oauth_credentials_verified_account_type_scope` |
| **DDL/DML** | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (×3); `DROP CONSTRAINT IF EXISTS`; `ADD CONSTRAINT … CHECK`; `NOTIFY pgrst` |
| **Dependencies** | `instagram_oauth_credentials` must exist (from prior IG-AUTH foundation migrations) |
| **Transaction boundary** | Single `begin;` … `commit;` |
| **Lock assessment** | `ALTER TABLE ADD COLUMN` — `ACCESS EXCLUSIVE` on `instagram_oauth_credentials` briefly; constraint drop/add — table rewrite not required for nullable columns; existing rows get NULL defaults |
| **Lock duration** | Proportional to `instagram_oauth_credentials` row count; likely sub-minute for small credential table |
| **Atomicity / partial risk** | Failure before commit rolls back all ALTERs in this file |
| **Idempotency** | `ADD COLUMN IF NOT EXISTS`; constraint drop+recreate — safe to rerun |
| **Destructive ops** | None (DROP CONSTRAINT only targets named check) |
| **Expected rows affected** | 0 updates; existing rows receive NULL on new columns |
| **Pre-execution verification** | `SELECT count(*) FROM instagram_oauth_credentials WHERE verified_account_type IS NOT NULL AND verified_account_type NOT IN ('BUSINESS','CREATOR')` — must be 0; column-existence check via `information_schema.columns` |
| **Post-execution verification** | Three columns exist, nullable; constraint definition matches migration |
| **Rollback strategy** | Do not DROP columns in production. Nullable additive columns are backward-compatible |
| **Forward-fix strategy** | Backfill identity fields via application when verification runs |
| **Operator stop criteria** | Stop if pre-check finds rows violating `BUSINESS`/`CREATOR` constraint |

---

### Migration 3: `20260621130000`

| Field | Detail |
| --- | --- |
| **Filename** | `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` |
| **Purpose** | Replace `create_outbound_message_with_outbox` to accept `p_instagram_credential_binding jsonb` and emit `instagramCredentialBinding` in outbox payload (IG-AUTH-2E.3) |
| **Objects affected** | Function `public.create_outbound_message_with_outbox` only |
| **DDL/DML** | `CREATE OR REPLACE FUNCTION …` (no explicit transaction wrapper) |
| **Dependencies** | Tables: `messages`, `conversations`, `activity_logs`, `outbox_events`; prior function signature with `p_conversation_ids` |
| **Transaction boundary** | **No explicit `begin/commit` in file** — Supabase CLI applies migration as one migration unit; function replacement is a single DDL statement |
| **Lock assessment** | `CREATE OR REPLACE FUNCTION` — brief exclusive lock on function OID; concurrent callers may block briefly during replace |
| **Lock duration** | Typically milliseconds to low seconds |
| **Atomicity / partial risk** | Function replace is one statement — prior definition fully replaced on success. Failed parse/compile aborts without applying new body |
| **Idempotency** | `CREATE OR REPLACE` — rerunnable to same definition |
| **Destructive ops** | Replaces prior function body; removes old overload if signature differs |
| **Expected rows affected** | 0 (DDL only) |
| **Signature after** | 16 parameters ending with `p_instagram_credential_binding jsonb default null`; returns `table (message_id uuid)` |
| **Callers** | `SupabaseOutboundCommandRepository` passes all 16 params including `p_instagram_credential_binding` (master code). Production DB may still have older signature until this migration applies |
| **Pre-execution verification** | `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_outbound_message_with_outbox'` — expect 1 overload; capture `pg_get_function_identity_arguments` before execution |
| **Post-execution verification** | Exactly one overload; arguments include `p_instagram_credential_binding jsonb`; `pg_get_functiondef` contains `instagramCredentialBinding` |
| **Rollback strategy** | Forward-restore from migration `20260430_add_conversation_ids…` + intervening reviewed definitions — **requires operator approval**; do not auto-DROP |
| **Forward-fix strategy** | Re-apply `CREATE OR REPLACE` from `20260621150000` if needed |
| **Operator stop criteria** | Stop if multiple overloads detected unexpectedly; stop if caller compatibility not confirmed |

---

### Migration 4: `20260621140000`

| Field | Detail |
| --- | --- |
| **Filename** | `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |
| **Purpose** | Idempotent reconciliation when `20260621120000` was skipped or mis-recorded — re-applies IG-AUTH-2D column/constraint changes |
| **Objects affected** | Same as `20260621120000`: `instagram_oauth_credentials` columns + `instagram_oauth_credentials_verified_account_type_scope` |
| **DDL/DML** | Identical pattern to 2D: `ADD COLUMN IF NOT EXISTS` ×3; `DROP CONSTRAINT IF EXISTS`; `ADD CONSTRAINT`; `NOTIFY pgrst` |
| **Relation to 2D** | Duplicate-safe; intended for history collision remediation path |
| **Transaction boundary** | Single `begin;` … `commit;` |
| **Lock assessment** | Same as 2D — brief `ACCESS EXCLUSIVE` on credentials table |
| **Idempotency** | **High** — IF NOT EXISTS / drop+recreate constraint |
| **Destructive ops** | None |
| **Expected rows affected** | 0 |
| **Pre-execution verification** | Same constraint-violation count as 2D |
| **Post-execution verification** | Columns and constraint match 2D; no duplicate constraints |
| **Rollback strategy** | Same as 2D — leave additive columns |
| **Forward-fix strategy** | N/A if idempotent pass |
| **Operator stop criteria** | Stop if 2D partially applied with incompatible column types |

---

### Migration 5: `20260621150000`

| Field | Detail |
| --- | --- |
| **Filename** | `20260621150000_legacy_20260430_reconciliation.sql` |
| **Purpose** | IG-AUTH-2E.6I Option B — idempotently ensure both historical `20260430` effects: final outbound RPC + Facebook DM reclassification data UPDATE |
| **Objects affected** | Function `create_outbound_message_with_outbox`; table `public.conversations` (`provider_thread_type`, `updated_at`) |
| **DDL/DML** | `CREATE OR REPLACE FUNCTION` (same body as `20260621130000`); bounded `UPDATE conversations SET provider_thread_type='FACEBOOK_COMMENT' …` |
| **Relations** | Function reconciles `20260430_add…` + `20260621130000`; data UPDATE matches `20260501120000_reclassify…` predicate |
| **Transaction boundary** | Single `begin;` … `commit;` wrapping function + UPDATE |
| **Lock assessment** | Function replace — brief; `UPDATE` — row-level locks on matching rows only |
| **Expected rows affected (UPDATE)** | **0** per latest read-only evidence (residual = 0) |
| **Pre-execution verification (mandatory)** | Residual count must be 0 before execution — see Part G |
| **Stop condition** | **HOLD if residual ≠ 0** — do not execute push |
| **Idempotency** | Function replace idempotent; UPDATE idempotent (sets same values) |
| **Destructive ops** | None — classification change only on bounded predicate |
| **Migration-history repair** | **Does NOT** run repair; **does NOT** repeat 20-version repair |
| **Post-execution verification** | Function matches 2E.3; residual count still 0 |
| **Rollback strategy** | Do not reverse data classification without reviewed forward-fix; function forward-restore from reviewed migration file |
| **Forward-fix strategy** | Re-run bounded UPDATE if new invalid rows appear (separate approval) |

---

## Part D — Rollback and forward-fix plan

**Global principles:**

- NO AUTOMATIC RETRY after push failure
- HOLD AND INSPECT before any second command
- No `DROP TABLE`, `DROP COLUMN`, or constraint removal in production without separate review
- Additive schema may remain; forward-fix preferred
- Function restore source: reviewed migration files on master `2c53862`

### Per-migration recovery matrix

| Version | Failure before | Failure during | Failure after | Auto-retry | Inspection | Preferred recovery | Approval required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20260620120000` | No remote row | Transaction abort — no partial table | Empty table exists | NO | migration list + table DDL | Fix cause; manual push only after HOLD cleared | YES |
| `20260621120000` | No remote row | Transaction abort | Columns exist | NO | columns + constraint + row violations | Forward-fix app; leave columns | YES |
| `20260621130000` | No remote row | Function compile error — old function may remain | New function live | NO | overload count + `pg_get_functiondef` | Re-apply from migration file | YES |
| `20260621140000` | No remote row | Transaction abort | Same as 2D outcome | NO | same as 2D | Idempotent re-push after inspection | YES |
| `20260621150000` | No remote row | Partial if split (unlikely in one txn) | Function + 0-row UPDATE | NO | function def + residual count | Forward-restore function; investigate data if residual > 0 | YES |

**Mid-push failure:** Do not rerun `db push`. Run read-only `supabase migration list --linked` and schema inspection queries only.

---

## Part E — Pre-execution gate checklist

| # | Gate | Required state |
| --- | --- | --- |
| 1 | Exclusive operator window | Agent A sole operator; no concurrent DB ops |
| 2 | No other migration/deployment active | Confirmed |
| 3 | Master SHA | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| 4 | Working tree clean | Tracked files clean on execution checkout |
| 5 | CLI version | `2.98.2` (no upgrade in window) |
| 6 | Five checksums | Match table above |
| 7 | Migration list | `20260501120000` applied; exactly 5 pending blank |
| 8 | Dry-run | Do not repeat unless master/history changed + new auth |
| 9 | Residual reclassification | `= 0` |
| 10 | Credential constraint pre-check | 0 violating rows |
| 11 | Caller compatibility | `SupabaseOutboundCommandRepository` reviewed for 16-param RPC |
| 12 | Backup/PITR | Operator confirms |
| 13 | Application deployment | Compatible build deployed or ready |
| 14 | Worker/API rollback posture | Confirmed |
| 15 | Post-execution reviewers | Agent A + Agent B + operator ready |
| 16 | Stop conditions | Acknowledged |

If master, remote history, or checksums change → **HOLD** and re-review.

---

## Part F — Maintenance-window assessment

| Question | Assessment |
| --- | --- |
| **Formal maintenance window required?** | **Recommended but not strictly required** if executed during low-traffic period |
| **Reason if no hard window** | Migrations are additive DDL + function replace + 0-row UPDATE; no large table rewrite; credential table small; reclassification UPDATE expected to touch 0 rows |
| **Caveat** | `ALTER TABLE instagram_oauth_credentials` takes `ACCESS EXCLUSIVE` lock — blocks concurrent writes to credentials during migration 2 and 4 |
| **Expected metadata locks** | Catalog locks on type/table/function creation; ACCESS EXCLUSIVE on `instagram_oauth_credentials` for ALTER |
| **Expected duration** | Order of minutes for full 5-migration push on current production size; dominated by CLI round-trip and credential ALTER |
| **User-facing impact** | Brief risk of outbound message RPC failure if function replaced during active send; Instagram OAuth connect not live until app uses new state table |
| **Workers/API pause** | **Recommended:** pause outbound worker during migrations 3–5 (function replace); API can remain if traffic low — operator discretion |
| **Concurrent writes risk** | Outbound sends during migration 3/5 may fail or block; credential updates during 2/4 may wait on lock |
| **Monitoring** | DB connection errors, RPC failures, outbox PENDING spike, worker error logs |
| **Abort threshold** | Push exit ≠ 0; residual ≠ 0 pre-check; unexpected overload; lock wait > operator threshold |

**Do not claim zero downtime** — function replacement and credential ALTER can cause sub-minute blocking.

---

## Part G — Exact post-execution verification plan (read-only; not executed in 2E.6U)

All queries: wrap in `begin; set transaction read only; …; rollback;` via `supabase db query --linked`.

### G.1 Migration-history verification

```bash
supabase migration list --linked
```

Expected: all five versions local + remote applied; pending count = 0; no split rows; no unexpected divergence.

### G.2 Schema verification — `20260620120000`

```sql
SELECT count(*)::int AS c
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'instagram_oauth_states';

SELECT count(*)::int AS c
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_instagram_oauth_states_state_hash',
    'idx_instagram_oauth_states_tenant',
    'idx_instagram_oauth_states_connection',
    'idx_instagram_oauth_states_expires_at'
  );

SELECT count(*)::int AS c
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname = 'instagram_oauth_state_status';
```

### G.3 Schema verification — `20260621120000` / `20260621140000`

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'instagram_oauth_credentials'
  AND column_name IN ('verified_username', 'verified_account_type', 'identity_verified_at')
ORDER BY column_name;

SELECT pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'instagram_oauth_credentials'
  AND c.conname = 'instagram_oauth_credentials_verified_account_type_scope';
```

### G.4 Function verification — `20260621130000` / `20260621150000`

```sql
SELECT count(*)::int AS overload_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox';

SELECT pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox';

SELECT count(*)::int AS has_binding_param
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox'
  AND pg_get_function_identity_arguments(p.oid) LIKE '%instagram_credential_binding%';

SELECT count(*)::int AS has_conversation_ids
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox'
  AND pg_get_function_identity_arguments(p.oid) LIKE '%conversation_ids%';
```

Definition spot-check (sanitized — no customer data):

```sql
SELECT strpos(pg_get_functiondef(p.oid)::text, 'instagramCredentialBinding') > 0 AS has_outbox_binding_field
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox'
LIMIT 1;
```

### G.5 Data verification

**Residual reclassification (mandatory):**

```sql
SELECT count(*)::int AS residual_count
FROM public.conversations
WHERE provider_thread_type = 'MESSENGER_DM'
  AND channel_type = 'FACEBOOK'
  AND provider_external_user_id IS NOT NULL
  AND (channel_thread_id IS NULL OR channel_thread_id NOT LIKE 'user:%');
```

Expected: `0`

**Credential constraint compatibility:**

```sql
SELECT count(*)::int AS violating_rows
FROM public.instagram_oauth_credentials
WHERE verified_account_type IS NOT NULL
  AND verified_account_type NOT IN ('BUSINESS', 'CREATOR');
```

Expected: `0`

**OAuth states baseline:**

```sql
SELECT count(*)::int AS state_row_count
FROM public.instagram_oauth_states;
```

Expected: `0` immediately after execution (pre-connect)

**Outbox binding field presence (aggregate only):**

```sql
SELECT count(*)::int AS rows_with_binding
FROM public.outbox_events
WHERE topic = 'message.outbound.requested'
  AND payload_json ? 'instagramCredentialBinding';
```

No payload content logged.

### G.6 Application smoke checklist (controlled; separate OAuth approval)

| Check | Method | Pass criteria |
| --- | --- | --- |
| Dashboard loads | Browser / health | 200, no 500 |
| Channel Settings | UI route | Renders without error |
| Instagram connection state API | Read-only GET | Expected contract shape |
| Existing Instagram channel | Status check | READY channels unchanged |
| Inbox/Leads/Work Queue APIs | Read-only list endpoints | No 500 |
| Outbox health | `SELECT count(*) … WHERE status='PENDING'` on outbound topic | No abnormal spike |
| Worker logs | Log scan | No SQL/RPC stack traces; no secret leak |
| Controlled outbound smoke | **Separate authorization** | Optional in execution window |
| OAuth reconnect | **Prohibited** without separate approval | Do not run |

### G.7 Monitoring window

| Phase | Timing | Actions |
| --- | --- | --- |
| Immediate | T+0 to T+5 min | migration list; schema queries; residual count |
| Post-traffic | T+15 to T+60 min | API smoke; outbox pending; worker errors |
| Escalation | On any failure signal | HOLD; no retry; notify Agent A/B/operator |

---

## Part H — Execution stop conditions

**Stop before or during execution if:**

- Master SHA ≠ `2c53862…`
- Any migration checksum changed
- Migration list ≠ 5 pending (plus repaired `20260501120000`)
- Residual reclassification ≠ 0
- Credential constraint pre-check ≠ 0
- Unexpected function overloads
- Another deployment/DB operation active
- Backup/PITR not confirmed
- Connection target ambiguous
- Dry-run evidence stale vs current state

**After push if exit code ≠ 0:**

- NO rerun
- NO repair
- NO manual rollback
- Read-only migration list + schema inspection only
- Report: `AMBIGUOUS / HOLD`

---

## Part I — Command authorization boundary

| Command | Status |
| --- | --- |
| `supabase db push --linked` | **NOT AUTHORIZED** in 2E.6U |
| `supabase db push --linked --dry-run` | **NOT AUTHORIZED** (already executed in 2E.6S) |
| `supabase migration repair` | **PROHIBITED** |

Required future authorization phrase:

```text
GO REAL DB PUSH LINKED — FIVE MIGRATIONS
```

Agent A must not execute real push from this document alone.

---

## Prohibited-action attestation (2E.6U)

| Action | Executed |
| --- | --- |
| Real `db push` | NO |
| Dry-run repeated | NO |
| Migration repair | NO |
| Migration up / reset | NO |
| Remote state changed | NO |
| Migration/SQL files changed | NO |

---

## Completion report

```text
IG-AUTH-2E.6U RESULT

PR: #274
Previous reviewed SHA: 3dfc098de8d30f30d9aed739d84d40c86060dee8
New exact SHA: 0505f045402b289afd77758763811c41c9c11ec0
Branch: docs/ig-auth-2e-6q-single-version-repair

Trailing whitespace fixed: YES
git diff --check: (verify after commit)
Diff docs-only: YES
Hidden/bidi scan: (verify after commit)
Secret scan: PASS

Execution readiness plan:
- Per-migration analysis complete: YES
- Dependency analysis complete: YES
- Lock/maintenance assessment complete: YES
- Rollback/forward-fix plan complete: YES
- Pre-execution gate complete: YES
- Exact post-execution queries prepared: YES
- Production smoke checklist prepared: YES
- Stop conditions complete: YES

Migration/SQL files changed: NO
Remote state changed: NO
Dry-run repeated: NO
Real db push executed: NO
Migration repair executed: NO

Decision:
READY FOR AGENT B EXACT-SHA RE-REVIEW

Operational state:
HOLD — NO REAL MIGRATION EXECUTION
```
