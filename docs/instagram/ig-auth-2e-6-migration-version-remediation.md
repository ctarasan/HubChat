# IG-AUTH-2E.6 Migration Version Remediation

Repository engineering remediation for duplicate Supabase migration version `20260621120000`. **Does not apply production migrations.**

**Related:** PR #258/#259 migration-window HOLD evidence; this document describes the **current remediated filenames** for future `GO MIGRATION WINDOW` execution.

---

## Summary

Two migrations shared version `20260621120000`:

| Historical filename | Phase |
| --- | --- |
| `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` | IG-AUTH-2D (earlier) |
| `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` | IG-AUTH-2E.3 (later) |

Remediation (IG-AUTH-2E.6C):

1. **Retain** 2D at `20260621120000`
2. **Rename** 2E.3 to `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` (SQL unchanged)
3. **Add** `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` (idempotent 2D reconcile)

Regression test: `src/lib/supabaseMigrationVersionUniqueness.test.ts`

---

## Collision discovered

Supabase records one `schema_migrations` row per numeric version prefix. Duplicate `20260621120000` made `supabase db push` ambiguous and blocked the production migration window (PR #258).

Production evidence (2E.5/2E.6): neither 2D identity columns nor 2E.3 RPC parameter were present — migration **NOT_APPLIED**.

---

## Git history

| File | First introduced | Commit |
| --- | --- | --- |
| 2D identity | PR #247 | `91ae0ef` |
| 2E.3 outbound binding | PR #254 | `43b98fb` |

2D is chronologically and semantically earlier. Neither file was renamed before this remediation.

---

## Selected version strategy

| Migration | Version | Rationale |
| --- | --- | --- |
| 2D identity (original) | `20260621120000` | Keep earliest reviewed artifact at original version |
| 2E.3 outbound binding | `20260621130000` | Unique, monotonically after 2D, before reconcile |
| 2D reconcile | `20260621140000` | Runs after 2E.3; idempotent safety net |

Maximum version before remediation: `20260621120000` (duplicate).

---

## Files renamed/added

| Action | Path |
| --- | --- |
| Retained | `supabase/migrations/20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` |
| Renamed from `…120000_ig_auth_2e3…` | `supabase/migrations/20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Added | `supabase/migrations/20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |

---

## SQL equivalence

2E.3 renamed migration functional SQL is **byte-for-byte equivalent** to PR #254 reviewed body (comments excluded). Verified by `supabaseMigrationVersionUniqueness.test.ts` comparing normalized SQL against `git show 43b98fb:…120000_ig_auth_2e3…`.

2D reconcile migration normalized SQL matches the original 2D migration (idempotent duplicate).

---

## Reconciliation behavior

`20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` ensures:

- `instagram_oauth_credentials.verified_username`
- `instagram_oauth_credentials.verified_account_type`
- `instagram_oauth_credentials.identity_verified_at`
- `instagram_oauth_credentials_verified_account_type_scope` constraint

Uses `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, and `notify pgrst, 'reload schema'`. No data mutation or backfill.

---

## Environment scenario matrix

| Scenario | What happened | Migrations that run on push | Resulting schema | Manual history edit? |
| --- | --- | --- | --- | --- |
| **A** | Duplicate never recorded | 2D → 2E.3 → reconcile | Full 2D + 2E.3 state | No |
| **B** | `20260621120000` recorded after **2D** SQL | `20260621130000`, `20260621140000` pending | 2E.3 RPC + columns (reconcile noop) | No |
| **C** | `20260621120000` recorded after **2E.3** SQL (alphabetical push risk) | `20260621140000` pending | Columns added; 2E.3 re-applied harmlessly | No |
| **D** | Version recorded, neither effect visible | `20260621130000`, `20260621140000` pending | Both effects applied | No |
| **E** | Both effects already exist | Pending versions only if unrecorded | Idempotent no-op DDL | No |

Duplicate DDL is harmless by design (`IF NOT EXISTS`, `CREATE OR REPLACE`).

**Do not** edit `supabase_migrations.schema_migrations` unless a separately approved repair plan requires it.

---

## Schema parity

`supabase/schema.sql` on master already includes:

- 2D identity columns on `instagram_oauth_credentials`
- 16-parameter `create_outbound_message_with_outbox` with `p_instagram_credential_binding jsonb default null`

No `schema.sql` change required for this remediation PR.

---

## Regression test

`src/lib/supabaseMigrationVersionUniqueness.test.ts`:

- Fails on duplicate numeric migration prefixes
- Validates 2E.3 SQL equivalence to reviewed commit
- Validates reconcile idempotency vs original 2D
- Validates sort order: 2D < 2E.3 < reconcile

---

## Production boundary

- Production migration remains **NOT_APPLIED** until a new `GO MIGRATION WINDOW`
- This PR does **not** repair production by itself
- Operator still needs Supabase CLI auth and/or `DATABASE_URL`
- Re-issue **`GO MIGRATION WINDOW`** after merge and verification

---

## Required next operator action

1. Merge remediation PR
2. Provide production DB admin path (`supabase login` + link, or `DATABASE_URL`)
3. Re-issue **`GO MIGRATION WINDOW`**
4. `supabase db push` (or approved equivalent) — expect three pending versions if production is clean
5. Verify `schema_migrations`, `pg_proc`, and PostgREST OpenAPI per [`ig-auth-2e-4-production-migration-preflight.md`](ig-auth-2e-4-production-migration-preflight.md)

---

## Scope confirmation

IG-AUTH-2E.6C repository migration-version remediation only. No production migration execution. No production database access. No environment, flag, deploy, provider, or outbound message changes.
