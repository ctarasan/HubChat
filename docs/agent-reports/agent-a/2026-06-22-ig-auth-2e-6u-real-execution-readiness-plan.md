# IG-AUTH-2E.6U — Real-Execution Readiness Plan

> **Agent:** A
> **Date:** 2026-06-22
> **Task:** IG-AUTH-2E.6U (corrected in IG-AUTH-2E.6W, IG-AUTH-2E.6Y)
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
| **Post-execution verification** | Table exists; enum exists; four indexes exist; all CHECK constraints and FK verified via `pg_constraint` (see G.2); row count = 0 |
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
| **DDL/DML** | `CREATE OR REPLACE FUNCTION …` with expanded parameter list (no explicit transaction wrapper) |
| **Dependencies** | Tables: `messages`, `conversations`, `activity_logs`, `outbox_events`; prior function overload with `p_conversation_ids` |
| **Transaction boundary** | **No explicit `begin/commit` in file** — single DDL statement per migration unit |
| **PostgreSQL overload semantics** | PostgreSQL identifies functions by **name + identity argument types**. `CREATE OR REPLACE FUNCTION` with a **different** argument list creates or replaces the **new** signature; it does **not** automatically remove a prior legacy signature. Both overloads may coexist after execution. Multiple known overloads are **not** automatically a failure. |
| **Lock assessment** | Brief catalog lock on the replaced/new function OID; concurrent callers may block briefly |
| **Atomicity / partial risk** | One DDL statement — new signature body applied on success; legacy overload unaffected unless separately dropped |
| **Idempotency** | `CREATE OR REPLACE` on the **same** signature is rerunnable |
| **Destructive ops** | Does not drop legacy overload; replaces body only for the matching new signature |
| **Expected rows affected** | 0 (DDL only) |
| **Legacy signature (expected pre-execution)** | `public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer)` — **15** input arguments, **7** `text` types; source: `20260430_add_conversation_ids_to_outbound_function.sql` |
| **Expanded signature (expected post-execution)** | `public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)` — **16** input arguments (legacy + trailing `jsonb`); source: `20260621130000` / `20260621150000` |
| **Callers** | `src/infrastructure/adapters/repositories/supabaseOutboundCommandRepository.ts` — **named** RPC arguments via `this.supabase.rpc("create_outbound_message_with_outbox", { … p_instagram_credential_binding: … })` |
| **Pre-execution verification** | Enumerate all overloads (see Part C-FN); record legacy + privileges/owner/security mode; confirm application passes `p_instagram_credential_binding` by name |
| **Post-execution verification** | New expanded signature exists; definition matches reviewed migration; named application call resolves to new signature; legacy overload identified explicitly; no unexpected third overload |
| **Rollback strategy** | **DO NOT DROP THE LEGACY FUNCTION DURING THE EXECUTION WINDOW.** Forward-restore new signature from reviewed migration file if needed |
| **Forward-fix strategy** | Re-apply `CREATE OR REPLACE` from `20260621150000` if needed. Legacy `DROP FUNCTION` requires separate review and operator authorization |
| **Operator stop criteria** | Stop if new signature missing; call resolution ambiguous; unexpected overload; owner/security/privileges differ unexpectedly; new body lacks `instagramCredentialBinding` |

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

## Part C-FN — Function overload semantics and verification

### PostgreSQL behavior (corrected)

- PostgreSQL resolves functions by **name + identity argument types**, not parameter names alone.
- `CREATE OR REPLACE FUNCTION` with an **expanded** parameter list creates or replaces the **new** signature only.
- It does **not** automatically remove a prior legacy signature with fewer parameters.
- After migrations `20260621130000` and `20260621150000`, **both** the legacy 15-argument overload and the new 16-argument overload may exist. This is **not** automatically an execution failure.
- Expected overload count must be derived from **actual pre-migration catalog state** plus migration SQL — not assumed to be `1`.

### Exact input argument types (from migration SQL)

Argument **names** are for caller-contract verification only — they are **not** PostgreSQL function identity.

| Position | Legacy type | Expanded type | Parameter name |
| --- | --- | --- | --- |
| 1 | `uuid` | `uuid` | `p_tenant_id` |
| 2 | `uuid` | `uuid` | `p_lead_id` |
| 3 | `uuid` | `uuid` | `p_conversation_id` |
| 4 | `jsonb` | `jsonb` | `p_conversation_ids` |
| 5 | `channel_type` | `channel_type` | `p_channel` |
| 6 | `text` | `text` | `p_channel_thread_id` |
| 7 | `text` | `text` | `p_content` |
| 8 | `text` | `text` | `p_message_type` |
| 9 | `text` | `text` | `p_media_url` |
| 10 | `text` | `text` | `p_preview_url` |
| 11 | `text` | `text` | `p_media_mime_type` |
| 12 | `text` | `text` | `p_file_name` |
| 13 | `bigint` | `bigint` | `p_file_size_bytes` |
| 14 | `integer` | `integer` | `p_width` |
| 15 | `integer` | `integer` | `p_height` |
| 16 | — | `jsonb` | `p_instagram_credential_binding` |

**Verified counts (IG-AUTH-2E.6Y):**

- Legacy input arguments: **15**
- Expanded input arguments: **16**
- `text` parameters in legacy/expanded shared prefix: **7** (positions 6–12), not 8

### Exact `regprocedure` identity strings (types only; no parameter names)

```text
Expected reviewed legacy signature:
public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer)

Expected reviewed expanded signature:
public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)
```

### Application caller (repository)

**File:** `src/infrastructure/adapters/repositories/supabaseOutboundCommandRepository.ts`

**Call style:** named arguments via Supabase client RPC:

```typescript
await this.supabase.rpc("create_outbound_message_with_outbox", {
  p_tenant_id: input.tenantId,
  // … other named params …
  p_instagram_credential_binding: input.instagramCredentialBinding
    ? toSafeInstagramCredentialBindingJson(input.instagramCredentialBinding)
    : null
});
```

Named calls including `p_instagram_credential_binding` must resolve to the **expanded** 16-argument overload after execution. Ambiguous resolution is a **stop condition**. Named-caller verification is **separate** from identity verification (see below).

### Enumerate all overloads (no name-based filtering)

```sql
SELECT
  p.oid,
  p.oid::regprocedure::text AS exact_regprocedure,
  n.nspname AS function_schema,
  p.proname AS function_name,
  p.pronargs AS input_argument_count,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_arguments(p.oid) AS declared_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proparallel AS parallel_safety,
  r.rolname AS owner,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox'
ORDER BY p.oid::regprocedure::text;
```

Use this query to list every overload, record `pronargs`, exact `regprocedure`, declared argument names/defaults, definition, owner, and security mode. **Do not** filter overloads using `LIKE` on `pg_get_function_identity_arguments`.

### Resolve exact OIDs via `to_regprocedure`

```sql
SELECT
  to_regprocedure(
    'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer)'
  ) AS legacy_function_oid,
  to_regprocedure(
    'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)'
  ) AS expanded_function_oid;
```

**Expected before execution:**

- `legacy_function_oid`: non-null if legacy overload exists per baseline
- `expanded_function_oid`: record actual pre-execution state (null if absent; non-null if already present — then verify definition instead of assuming absence)

**Expected after execution:**

- `expanded_function_oid`: **non-null**
- `pg_get_functiondef(expanded_function_oid)` matches reviewed final migration

Do not use overload count alone as primary PASS criteria.

### Compare discovered overload set to reviewed exact set

```sql
WITH discovered AS (
  SELECT p.oid::regprocedure::text AS exact_signature
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_outbound_message_with_outbox'
)
SELECT exact_signature
FROM discovered
ORDER BY exact_signature;
```

**Stop when:**

- expanded exact signature is missing post-execution
- legacy state differs from reviewed expectation vs pre-execution baseline
- any signature outside the reviewed legacy + expanded set appears
- exact type order or `pronargs` does not match reviewed migrations
- expanded `pg_get_functiondef` differs from reviewed SQL

Overload count may be recorded as a supporting signal only.

### Named-caller verification (separate from identity)

```sql
SELECT
  p.oid::regprocedure::text AS exact_regprocedure,
  p.pronargs,
  p.proargnames,
  pg_get_function_arguments(p.oid) AS declared_arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox'
ORDER BY p.oid::regprocedure::text;
```

On the **expanded** overload OID (resolved via `to_regprocedure`, not name `LIKE`):

- `pronargs` = 16
- `proargnames` includes `p_instagram_credential_binding`
- repository caller (`SupabaseOutboundCommandRepository`) sends RPC key `p_instagram_credential_binding`

### Pre-execution inspection record

- each discovered `exact_regprocedure` string
- `legacy_function_oid` and `expanded_function_oid` from `to_regprocedure`
- owner, `prosecdef`, volatility, and grants
- whether legacy 15-arg overload is present (expected in current production)
- whether expanded 16-arg overload is already present (record actual state)

### Post-execution expectations

1. New expanded signature **exists**
2. Its `pg_get_functiondef` matches reviewed migration SQL (contains `instagramCredentialBinding` in outbox payload build)
3. Named application call with `p_instagram_credential_binding` resolves to the new signature (verify via API smoke / RPC success — not direct `SELECT` invocation unless separately authorized)
4. Legacy overload **identified explicitly** — may still exist; not a block by itself
5. **No unexpected third overload**
6. Privileges, owner, and security mode on new overload remain appropriate

### Recovery posture

```text
DO NOT DROP THE LEGACY FUNCTION DURING THE EXECUTION WINDOW
```

If the legacy overload must later be removed:

- confirm no caller uses the legacy signature
- record exact legacy `regprocedure` identity (not parameter-name substring)
- separately reviewed `DROP FUNCTION public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer)`
- separate operator authorization
- forward-only PR/migration

**No ad hoc `DROP FUNCTION` is authorized during the five-migration push.**

### Verification sequence

**Before execution:**

1. Enumerate all overloads (unfiltered)
2. Resolve `legacy_function_oid` and `expanded_function_oid` via `to_regprocedure`
3. Compare discovered exact signatures to reviewed set
4. Capture definitions, owners, security modes, and privileges
5. Confirm application call site and RPC keys (`SupabaseOutboundCommandRepository`)
6. Record pre-execution legacy and expanded OID state

**Immediately after execution:**

1. Enumerate all overloads again
2. Confirm `expanded_function_oid` is non-null
3. Confirm expanded `pronargs` = 16 and exact type order matches reviewed migration
4. Compare `pg_get_functiondef(expanded_function_oid)` to reviewed SQL
5. Confirm declared argument names on expanded overload include `p_instagram_credential_binding`
6. Confirm expected legacy overload state vs baseline
7. Confirm no unexpected exact signature outside reviewed set
8. Confirm privileges / owner / security mode on expanded overload
9. Run read-only application/API health checks (named RPC contract)

Do **not** invoke the function directly in production solely for schema verification unless separately authorized.

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
| `20260621130000` | No remote row | Function compile error — prior overloads unchanged | New signature live; legacy may remain | NO | overload enumeration + `pg_get_functiondef` on new signature | Re-apply from migration file; **do not DROP legacy** | YES |
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
| 8 | **Linked project target verified and unambiguous** | See linked-target gate below |
| 9 | Dry-run | Do not repeat unless master/history changed + new auth |
| 10 | Residual reclassification | `= 0` |
| 11 | Credential constraint pre-check | 0 violating rows |
| 12 | Caller compatibility | Named RPC with `p_instagram_credential_binding` reviewed; overload enumeration captured |
| 13 | Backup/PITR | Operator confirms |
| 14 | Application deployment | Compatible build deployed or ready |
| 15 | Worker/API rollback posture | Confirmed |
| 16 | Post-execution reviewers | Agent A + Agent B + operator ready |
| 17 | Stop conditions | Acknowledged |
| 18 | Function overload pre-inspection | Legacy/new signatures recorded from catalog |

If master, remote history, or checksums change → **HOLD** and re-review.

### Linked-project target gate

| Field | Required confirmation |
| --- | --- |
| Expected environment | SmartKorp **production** |
| Expected project reference (sanitized) | `dsky…hyx` (masked linked ref — verify matches operator expectation) |
| Linked status | Repository `supabase link` points to intended production project |
| Operator attestation | Operator confirms current checkout is linked to intended project — not staging/local |
| Ambiguity stop | **HOLD — LINKED PROJECT TARGET IS AMBIGUOUS** |

**Do not record:** database passwords, access tokens, connection strings, or service-role keys.

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
| **Abort threshold** | Push exit ≠ 0; residual ≠ 0 pre-check; new signature missing; call resolution ambiguous; unexpected overload; lock wait > operator threshold |

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

**Table, enum, and indexes:**

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

**All constraints on `public.instagram_oauth_states`:**

```sql
SELECT
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  c.convalidated AS is_validated,
  pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.instagram_oauth_states'::regclass
ORDER BY c.conname;
```

**Expected constraint definitions (from migration file):**

| Constraint | Type | Expected definition |
| --- | --- | --- |
| `instagram_oauth_states_provider_scope` | CHECK | `(provider = 'INSTAGRAM'::channel_type)` |
| `instagram_oauth_states_return_destination_scope` | CHECK | `(return_destination = ANY (ARRAY['CHANNEL_SETTINGS'::text]))` |
| `instagram_oauth_states_claim_timestamps` | CHECK | `((claimed_at IS NULL AND status = 'PENDING'::instagram_oauth_state_status) OR (claimed_at IS NOT NULL AND status = ANY (ARRAY['CLAIMED'::instagram_oauth_state_status, 'CONSUMED'::instagram_oauth_state_status, 'FAILED'::instagram_oauth_state_status])))` |
| `instagram_oauth_states_consumed_timestamps` | CHECK | `((consumed_at IS NULL AND status = ANY (ARRAY['PENDING'::instagram_oauth_state_status, 'CLAIMED'::instagram_oauth_state_status])) OR (consumed_at IS NOT NULL AND status = ANY (ARRAY['CONSUMED'::instagram_oauth_state_status, 'FAILED'::instagram_oauth_state_status])))` |
| `instagram_oauth_states_tenant_connection_fk` | FK | `FOREIGN KEY (tenant_id, channel_connection_id) REFERENCES channel_connections(tenant_id, id) ON DELETE CASCADE` |
| `instagram_oauth_states_pkey` | PRIMARY KEY | on `id` |

Note: `pg_get_constraintdef` output may normalize syntax; compare semantic equivalence.

**Focused FK query:**

```sql
SELECT
  c.conname,
  pg_get_constraintdef(c.oid, true) AS definition,
  c.convalidated
FROM pg_constraint c
WHERE c.conrelid = 'public.instagram_oauth_states'::regclass
  AND c.contype = 'f';
```

**CHECK constraint violation counts (bounded; no PII):**

```sql
SELECT count(*)::int AS provider_scope_violations
FROM public.instagram_oauth_states
WHERE provider <> 'INSTAGRAM'::channel_type;

SELECT count(*)::int AS return_destination_violations
FROM public.instagram_oauth_states
WHERE return_destination NOT IN ('CHANNEL_SETTINGS');

SELECT count(*)::int AS claim_timestamps_violations
FROM public.instagram_oauth_states
WHERE NOT (
  (claimed_at IS NULL AND status = 'PENDING')
  OR (claimed_at IS NOT NULL AND status IN ('CLAIMED', 'CONSUMED', 'FAILED'))
);

SELECT count(*)::int AS consumed_timestamps_violations
FROM public.instagram_oauth_states
WHERE NOT (
  (consumed_at IS NULL AND status IN ('PENDING', 'CLAIMED'))
  OR (consumed_at IS NOT NULL AND status IN ('CONSUMED', 'FAILED'))
);
```

Expected for every violation count: **0**

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

Post-execution checks in order (read-only). **Do not** use `LIKE '%instagram_credential_binding%'` or `LIKE '%conversation_ids%'` on `pg_get_function_identity_arguments`. **Do not** require `overload_count = 1`.

**Step 1 — Enumerate all overloads (unfiltered):**

```sql
SELECT
  p.oid,
  p.oid::regprocedure::text AS exact_regprocedure,
  n.nspname AS function_schema,
  p.proname AS function_name,
  p.pronargs AS input_argument_count,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_arguments(p.oid) AS declared_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proparallel AS parallel_safety,
  r.rolname AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'create_outbound_message_with_outbox'
ORDER BY p.oid::regprocedure::text;
```

**Step 2 — Resolve exact legacy and expanded OIDs:**

```sql
SELECT
  to_regprocedure(
    'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer)'
  ) AS legacy_function_oid,
  to_regprocedure(
    'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)'
  ) AS expanded_function_oid;
```

**Step 3 — Expanded OID must be non-null post-execution.**

**Step 4 — Verify expanded argument count:**

```sql
SELECT p.pronargs AS expanded_pronargs
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)'
);
```

Expected: `expanded_pronargs = 16`

**Step 5 — Compare discovered set to reviewed exact signatures:**

```sql
WITH discovered AS (
  SELECT p.oid::regprocedure::text AS exact_signature
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_outbound_message_with_outbox'
),
expected AS (
  SELECT unnest(ARRAY[
    'create_outbound_message_with_outbox(uuid,uuid,uuid,jsonb,channel_type,text,text,text,text,text,text,text,bigint,integer,integer)',
    'create_outbound_message_with_outbox(uuid,uuid,uuid,jsonb,channel_type,text,text,text,text,text,text,text,bigint,integer,integer,jsonb)'
  ]::text[]) AS expected_suffix
)
SELECT d.exact_signature
FROM discovered d
ORDER BY d.exact_signature;
```

Compare output to pre-execution baseline and reviewed expectations. Stop on any unexpected exact signature. (Normalize spacing when comparing manually if needed.)

**Step 6 — Definition check on expanded OID only:**

```sql
SELECT strpos(
  pg_get_functiondef(
    to_regprocedure(
      'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)'
    )
  )::text,
  'instagramCredentialBinding'
) > 0 AS has_outbox_binding_field;
```

Expected: `has_outbox_binding_field = true`

**Step 7 — Named-caller contract on expanded overload (identity separate):**

```sql
SELECT
  p.oid::regprocedure::text AS exact_regprocedure,
  p.pronargs,
  p.proargnames,
  pg_get_function_arguments(p.oid) AS declared_arguments
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)'
);
```

Expected: `proargnames` includes `p_instagram_credential_binding`; repository sends matching RPC key.

**Step 8 — Owner / security mode / privileges on expanded overload:**

```sql
SELECT p.prosecdef AS security_definer, r.rolname AS owner
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.oid = to_regprocedure(
  'public.create_outbound_message_with_outbox(uuid, uuid, uuid, jsonb, channel_type, text, text, text, text, text, text, text, bigint, integer, integer, jsonb)'
);

SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'create_outbound_message_with_outbox'
ORDER BY grantee, privilege_type;
```

Compare to pre-execution baseline.

**Step 9 — Legacy overload state:** record `legacy_function_oid` (may be non-null; not a failure by itself).

**Step 10 — Application smoke:** confirm named RPC from `SupabaseOutboundCommandRepository` succeeds without ambiguous overload resolution.

**Step 11 — Do not invoke the function directly in production for schema verification unless separately authorized.

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
- **Expected expanded exact signature is missing** post-execution (`expanded_function_oid` null)
- **Unexpected exact signature** outside reviewed legacy + expanded set
- **Application named call does not resolve** to expanded overload (ambiguous RPC)
- **Expanded `pronargs` ≠ 16** or exact type order differs from reviewed migration
- **Function body differs** from reviewed migration on expanded OID
- **Privileges, owner, or security mode** changed unexpectedly on the new overload
- **Linked project target is ambiguous** → `HOLD — LINKED PROJECT TARGET IS AMBIGUOUS`
- Another deployment/DB operation active
- Backup/PITR not confirmed
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

## Completion report (IG-AUTH-2E.6Y correction)

```text
IG-AUTH-2E.6Y RESULT

PR: #274
Previous Agent B reviewed SHA: e3c55c370aaaa11fd7f0e2242e2b0410026d4663
Current correction review SHA: Provided externally after push
Branch: docs/ig-auth-2e-6q-single-version-repair

Name-based identity filters removed: YES
Exact legacy regprocedure documented: YES
Exact expanded regprocedure documented: YES
Legacy argument count verified: YES (15)
Expanded argument count verified: YES (16)
Seven text parameters verified: YES (positions 6–12)

to_regprocedure checks added: YES
Exact overload-set comparison added: YES
Identity and named-caller checks separated: YES
G.4 post-execution query corrected: YES
Automatic legacy drop prohibited: YES

git diff --check: PASS
Diff docs-only: YES
Hidden/bidi scan: PASS
Secret scan: PASS
Five migration checksums unchanged: YES

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
