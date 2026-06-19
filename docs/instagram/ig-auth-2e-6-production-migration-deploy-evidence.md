# IG-AUTH-2E.6 Production Migration Evidence

Sanitized evidence for the authorized migration window (`GO MIGRATION WINDOW`). **Migration was not applied** in this session.

---

## Approval

| Field | Value |
| --- | --- |
| Authorization phrase | `GO MIGRATION WINDOW` |
| Not authorized | OAuth flag enablement, connection onboarding, Test Connection, outbound send, canary, queue mutation, credential change |
| Execution window (Asia/Bangkok) | 2026-06-19 14:58–15:05 |

---

## Scope and prohibitions

Hard prohibitions observed: no feature-flag changes, no OAuth connection changes, no provider calls, no outbound messages, no queue mutations, no manual DDL outside approved migration mechanism, no deploy before DB migration, no merge.

---

## Master and production baseline

| Item | Value |
| --- | --- |
| Master SHA | `d588de7b48ea10d2dd36a7ec741219a38b758b60` |
| PR #255 / #256 / #257 | Present on master (#257 at HEAD) |
| Evidence branch | `docs/ig-auth-2e-6a-production-migration-evidence` |
| Supabase host (masked) | `dsky…hyx.supabase.co` |
| Prior 2E.5 decision | HOLD — migration NOT_APPLIED, RPC binding param absent |
| Application version-skew risk | **Yes** — deployed code passes `p_instagram_credential_binding`; production OpenAPI still lacks parameter |

---

## Pre-migration queue baseline

Captured 2026-06-19 14:58 +07 (read-only aggregate).

| Metric | Count |
| --- | ---: |
| Outbound PENDING | 0 |
| Outbound PROCESSING | 0 |
| Stale PROCESSING (>15 min) | 0 |
| OAuth-bound PENDING | 0 |
| OAuth-bound PROCESSING | 0 |
| Malformed bindings | 0 |
| Outbox PENDING | 0 |
| DEAD_LETTER (context) | 39 |

**Pre-migration gate:** PASS — safe to migrate from queue perspective.

---

## Pending migration set

| Migration file | Version | Expected for 2E.6 | Production state (inferred) |
| --- | --- | --- | --- |
| `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` | `20260621120000` | **Yes — target** | NOT_APPLIED (OpenAPI binding param absent) |
| `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` | `20260621120000` | **Unexpected duplicate version** | NOT_APPLIED (identity columns absent) |

### Migration artifact review (pre-execution)

Target migration `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` confirmed:

| Check | Result |
| --- | --- |
| Additive `CREATE OR REPLACE FUNCTION` only | PASS |
| `p_instagram_credential_binding jsonb default null` | PASS |
| No `DROP` / `TRUNCATE` | PASS |
| No destructive DML | PASS (function body `UPDATE conversations` is existing pattern) |
| No mandatory backfill | PASS |
| No secret/credential columns | PASS |
| Legacy callers compatible (`default null`) | PASS |
| `schema.sql` parity on master | PASS |

### Pending-set blocker

Two migrations share the **same version prefix** `20260621120000`. Standard Supabase migration history records one row per version. Applying via `supabase db push` without review would not guarantee isolated application of the 2E.3 RPC migration alone.

**Decision:** STOP before migration execution — pending set is **ambiguous** relative to runbook requirement for exactly the approved migration.

---

## Migration execution

| Field | Value |
| --- | --- |
| **Production migration executed** | **NO** |
| Start timestamp | 2026-06-19 14:58 +07 |
| Completion timestamp | — |
| Execution result | **BLOCKED** |
| Blocker 1 | No production database admin path: `SUPABASE_ACCESS_TOKEN` absent, `DATABASE_URL` absent, `supabase` CLI not authenticated, `supabase link` not configured |
| Blocker 2 | Duplicate migration version `20260621120000` (2D + 2E.3) — cannot confirm isolated pending set |

No raw CLI output containing connection strings was captured or committed.

---

## Migration history after

| Field | Value |
| --- | --- |
| Before | NOT_APPLIED |
| After | NOT_APPLIED (unchanged) |
| `schema_migrations` direct query | Not executed (no Postgres session) |

---

## RPC signature and overload verification

| Method | Result |
| --- | --- |
| `pg_proc` query (§7 runbook) | **Not executed** (no Postgres session) |
| PostgREST OpenAPI (pre-migration) | `p_instagram_credential_binding` **absent** (0 occurrences) |

| Classification | Value |
| --- | --- |
| **RPC decision** | **RPC_NOT_MIGRATED** (unchanged) |

---

## PostgREST/OpenAPI verification

| Field | Value |
| --- | --- |
| Binding parameter exposed | **No** |
| Schema cache refresh | **Not applicable** (migration not applied) |

---

## Schema compatibility

| Check | State |
| --- | --- |
| Repository passes `p_instagram_credential_binding` | Yes (master code) |
| Production RPC accepts parameter | **No** |
| 2D identity columns (`verified_username`, etc.) | **Absent** in production |
| **Parity** | **Incompatible** until migrations applied |

---

## Deployment decision

| Environment | SHA source | SHA | Action |
| --- | --- | --- | --- |
| Master (approved) | git | `d588de7` | Baseline |
| Railway worker | Railway deployment JSON | `d588de7` | **SKIPPED_ALREADY_CURRENT** |
| Vercel Production | Alias inspect + deploy timing | `d588de7` (INFERRED) | **SKIPPED_ALREADY_CURRENT** |

No redeploy performed. Runbook DB-first rule honored: **no deploy attempted before migration**.

Worker online; `/ready` returned HTTP 200. App homepage returned HTTP 200.

---

## Vercel state

| Field | Value |
| --- | --- |
| Alias | `smartkorp-hub-chat.vercel.app` |
| Status | Ready (inspected 2026-06-19 ~14:46 +07) |
| Deploy action | SKIPPED_ALREADY_CURRENT |

---

## Railway state

| Field | Value |
| --- | --- |
| Worker status | Online |
| Deployment SHA | `d588de7` (VERIFIED via Railway JSON) |
| Deployment ID (masked) | `69ab…af05` |
| `/ready` | HTTP 200 |
| Deploy action | SKIPPED_ALREADY_CURRENT |

---

## OAuth flag states

All five delivery flags on Railway: **ABSENT**.

Vercel Production: no `HUBCHAT_INSTAGRAM_OAUTH_*` names in `vercel env ls` output → **ABSENT**.

No flag values recorded. No flag changes performed.

---

## Post-migration queue baseline

Not applicable — migration not executed. Pre-migration baseline unchanged.

---

## Application/worker health

| Check | Result |
| --- | --- |
| App homepage | HTTP 200 |
| Worker `/ready` | HTTP 200 |
| RPC parameter errors in logs | Not searched (no log export in this session) |
| Outbound test send | **Not performed** |

---

## Security sanitization

- No database URLs, service keys, tokens, Authorization headers, or env dumps committed
- Supabase host masked; deployment IDs masked
- Temporary `.env.ig2e6-prod` deleted after use
- Local runner scripts not committed

---

## Failures or deviations

1. **Migration not executed** — insufficient production Postgres/Supabase CLI credentials in operator environment.
2. **Duplicate migration version** `20260621120000` for 2D identity and 2E.3 outbound binding — pending set not uniquely the approved migration.
3. **2D identity migration also pending** — production lacks `verified_username` / `verified_account_type` / `identity_verified_at` columns.
4. **`pg_proc` verification deferred** — requires direct Postgres read after migration.

---

## Decision

| Outcome | Value |
| --- | --- |
| **Decision** | **HOLD** |
| Migration window | **Not completed** |
| Ready for connection onboarding / canary | **No** |

---

## Next approval required

1. Operator provides **Supabase CLI authentication** (`supabase login` or `SUPABASE_ACCESS_TOKEN`) and/or **read-write `DATABASE_URL`** for production.
2. Resolve **duplicate migration version** `20260621120000` with a reviewed plan (renumber 2D or 2E.3, or confirm combined apply order and history recording).
3. Re-issue **`GO MIGRATION WINDOW`** after access + pending-set resolution.
4. After successful migration + RPC verify: **`GO DEPLOY FLAGS-OFF`** only if deploy SHA drifts; connection onboarding remains separate.

---

## Scope confirmation

IG-AUTH-2E.6A production migration window and flags-OFF verification only. No OAuth flag enablement. No connection onboarding. No provider/Test Connection calls. No outbound text/image messages. No canary. No queue mutation. No credential change. No private reply, legacy retirement, or live rollout. No merge performed.

---

## Required attestation

```text
Production migration executed: NO
Approved migration only: INTENDED (blocked before execution)
Other migrations executed: NONE
Manual DDL executed: NONE
Manual data writes/backfills: NONE
Queue mutations: NONE
Environment changes: NONE
Feature-flag changes: NONE
Credential changes: NONE
Provider calls: NONE
Outbound messages: NONE
Canary execution: NONE

Vercel deployment: SKIPPED_ALREADY_CURRENT
Railway deployment: SKIPPED_ALREADY_CURRENT
```
