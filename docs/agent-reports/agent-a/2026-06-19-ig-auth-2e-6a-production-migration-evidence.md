# IG-AUTH-2E.6A Production Migration Evidence

> **Agent:** A
> **Date:** 2026-06-19
> **Branch:** `docs/ig-auth-2e-6a-production-migration-evidence`
> **Base master SHA:** `d588de7b48ea10d2dd36a7ec741219a38b758b60`
> **Authorization:** `GO MIGRATION WINDOW`
> **Companion evidence:** [`ig-auth-2e-6-production-migration-deploy-evidence.md`](../../instagram/ig-auth-2e-6-production-migration-deploy-evidence.md)

---

## Summary

Migration window opened under `GO MIGRATION WINDOW`. Pre-migration queue gates **passed** (zero active outbound/OAuth-bound jobs; OAuth flags ABSENT). Target migration artifact reviewed and matches approved additive 2E.3 RPC binding change.

**Migration was not executed.** Production database admin access is unavailable in this environment (`SUPABASE_ACCESS_TOKEN` absent, `DATABASE_URL` absent, Supabase CLI not linked/authenticated). Additionally, a **duplicate migration version** `20260621120000` exists for both 2D identity and 2E.3 outbound binding files — pending set is ambiguous per runbook STOP rules.

Deployments were **SKIPPED_ALREADY_CURRENT** at master `d588de7` (Railway VERIFIED; Vercel INFERRED). No redeploy before DB migration.

**Decision: HOLD**

---

## Migration artifact inspection

Reviewed `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` on master:

- Additive `CREATE OR REPLACE FUNCTION` with `p_instagram_credential_binding jsonb default null`
- No DROP/TRUNCATE/destructive DML/backfill
- Matches `supabase/schema.sql` 16-parameter signature

**Artifact review:** PASS

---

## Pre-migration baseline (2026-06-19 14:58 +07)

| Metric | Value |
| --- | ---: |
| PENDING | 0 |
| PROCESSING | 0 |
| Stale PROCESSING | 0 |
| OAuth-bound PENDING | 0 |
| OAuth-bound PROCESSING | 0 |
| Malformed bindings | 0 |
| OpenAPI binding param | absent |

Gate: **PASS** — safe to migrate from queue/flag perspective.

---

## Pending migration set issue

| File | Same version | Production inferred |
| --- | --- | --- |
| `…_ig_auth_2d_instagram_oauth_identity_verification.sql` | `20260621120000` | NOT_APPLIED (identity columns missing) |
| `…_ig_auth_2e3_outbound_instagram_binding.sql` | `20260621120000` | NOT_APPLIED (RPC param absent) |

Runbook requires exactly the 2E.3 migration pending. Duplicate version prefix triggers **STOP** before `supabase db push` / include-all.

---

## Migration execution result

| Field | Value |
| --- | --- |
| Executed | **NO** |
| Reason | No DB admin credentials + ambiguous pending set |
| Migration state after | NOT_APPLIED |
| RPC classification | RPC_NOT_MIGRATED |

---

## Deployment

| Surface | SHA | Action |
| --- | --- | --- |
| Master | `d588de7` | Approved baseline |
| Railway worker | `d588de7` (VERIFIED) | SKIPPED_ALREADY_CURRENT |
| Vercel | `d588de7` (INFERRED) | SKIPPED_ALREADY_CURRENT |

Worker `/ready` HTTP 200. App homepage HTTP 200. OAuth flags ABSENT on Railway; absent on Vercel name scan.

---

## Completion report

```text
Branch: docs/ig-auth-2e-6a-production-migration-evidence
Commit: (pending)
PR: (pending)
Base master SHA: d588de7b48ea10d2dd36a7ec741219a38b758b60
Execution start: 2026-06-19 14:58 +07
Execution end: 2026-06-19 15:05 +07

Pre-migration queue baseline: PASS (all zeros for active/OAuth-bound)
Pending migration set: BLOCKED — duplicate version 20260621120000 (2D + 2E.3)
Migration executed: NO
Migration result: BLOCKED
Migration history result: NOT_APPLIED (unchanged)
RPC overload count: not queried (no Postgres session)
RPC signature: RPC_NOT_MIGRATED
p_instagram_credential_binding present: NO (OpenAPI)
PostgREST/OpenAPI updated: NO
RPC ambiguity: N/A pre-migration
Schema parity: INCOMPATIBLE

Vercel approved SHA: d588de7 (INFERRED)
Vercel deployment action: SKIPPED_ALREADY_CURRENT
Railway approved SHA: d588de7 (VERIFIED)
Railway deployment action: SKIPPED_ALREADY_CURRENT
Worker status: online, /ready 200

Vercel flag states: all five ABSENT
Railway flag states: all five ABSENT

Post-migration queue baseline: N/A (migration not applied)
OAuth-bound jobs: 0
Malformed bindings: 0
Health/log verification: app 200, worker /ready 200

Manual DDL: NONE
Manual data writes: NONE
Queue mutations: NONE
Environment changes: NONE
Feature-flag changes: NONE
Credential changes: NONE
Provider calls: NONE
Outbound messages: NONE
Canary: NONE

Blocking findings:
- Migration not executed (no Supabase CLI auth / DATABASE_URL)
- Duplicate migration version 20260621120000
- APP/DB version skew remains (RPC param missing)

Non-blocking notes:
- Pre-migration queue gates pass
- Deployments already at approved master
- OAuth flags remain OFF/ABSENT

Decision: HOLD
Next approval required: resolve DB access + migration version collision; re-issue GO MIGRATION WINDOW

Scope confirmation:
IG-AUTH-2E.6A production migration window and flags-OFF verification only.
No OAuth flag enablement. No connection onboarding. No provider/Test Connection calls.
No outbound text/image messages. No canary. No queue mutation. No credential change.
No private reply, legacy retirement, or live rollout. No merge performed.
```

---

## Operator actions to unblock

1. `supabase login` (or set `SUPABASE_ACCESS_TOKEN`) and `supabase link --project-ref dsky…hyx` with production DB password.
2. Resolve duplicate `20260621120000` migration filenames (engineering review — renumber one migration before push).
3. Re-run migration window with direct `schema_migrations` + `pg_proc` verification post-apply.
4. Confirm PostgREST exposes `p_instagram_credential_binding` before any outbound traffic test.
