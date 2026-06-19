# IG-AUTH-2E.6C Migration Version Collision Fix

> **Agent:** A
> **Date:** 2026-06-19
> **Branch:** `fix/ig-auth-2e6-migration-version-collision`
> **Base master SHA:** `b3b298009baa21d5c5938dbb7ab43b9fdcdc5eee`
> **Companion:** [`ig-auth-2e-6-migration-version-remediation.md`](../../instagram/ig-auth-2e-6-migration-version-remediation.md)

---

## Summary

Resolved duplicate Supabase migration version `20260621120000` that blocked the production migration window (PR #258/#259). Repository-only change: rename 2E.3 migration, add idempotent 2D reconciliation migration, add uniqueness regression test, update operator preflight/runbook references.

**Production migration remains NOT_APPLIED.** No production database access or mutation.

---

## Collision discovered

Full scan of `supabase/migrations/` found **one** duplicate **14-digit** version (the IG-AUTH collision):

```text
20260621120000 → 2D identity + 2E.3 outbound binding (2 files)
```

**Note:** Legacy 8-digit prefixes (e.g. `20260430`) also collide in this repository but predate this remediation and are out of IG-AUTH-2E.6C scope. New regression test enforces uniqueness for `YYYYMMDDHHMMSS` migrations.

Maximum version before fix: `20260621120000`.

---

## Git history

| Migration | Introduced | Commit |
| --- | --- | --- |
| 2D identity | First | `91ae0ef` (#247) |
| 2E.3 binding | Later | `43b98fb` (#254) |

2D retained at original version; 2E.3 renamed.

---

## Selected version strategy

| Role | Version | Filename |
| --- | --- | --- |
| Earlier (retained) | `20260621120000` | `…_ig_auth_2d_instagram_oauth_identity_verification.sql` |
| Later (renamed) | `20260621130000` | `…_ig_auth_2e3_outbound_instagram_binding.sql` |
| Reconcile (new) | `20260621140000` | `…_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |

`20260621130000` chosen as next unique prefix after max `20260621120000`, preserving chronological order (2D → 2E.3 → reconcile).

---

## Files changed

| Change | Path |
| --- | --- |
| Renamed | `20260621120000_ig_auth_2e3…` → `20260621130000_ig_auth_2e3…` |
| Added | `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |
| Added | `src/lib/supabaseMigrationVersionUniqueness.test.ts` |
| Updated | `docs/instagram/ig-auth-2e-4-production-migration-preflight.md` |
| Updated | `docs/instagram/ig-auth-2e-4-controlled-rollout-runbook.md` |

Historical agent reports (2E.3–2E.6) **not rewritten** — they document the conflicting filename at time of capture.

---

## SQL equivalence

2E.3: normalized SQL matches `git show 43b98fb:supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` (automated test).

2D reconcile: normalized SQL matches original 2D migration (automated test).

---

## Scenario matrix

| Scenario | Outcome |
| --- | --- |
| A — never recorded | All three apply cleanly |
| B — 20260621120000 after 2D | 2E.3 + reconcile pending |
| C — 20260621120000 after 2E.3 | Reconcile adds columns; 2E.3 at new version re-applies safely |
| D — recorded, no visible effect | 2E.3 + reconcile pending |
| E — both effects exist | Idempotent no-op |

No manual `schema_migrations` edits recommended.

---

## Schema parity

`supabase/schema.sql` already reflects final intended state. No schema.sql diff in this PR.

---

## Regression test

`supabaseMigrationVersionUniqueness.test.ts` — duplicate scan, equivalence, ordering.

---

## Production boundary

This PR does not execute production migration. Operator must re-issue **`GO MIGRATION WINDOW`** after merge.

---

## Completion report

```text
Branch: fix/ig-auth-2e6-migration-version-collision
Commit: (pending)
PR: (pending)
Base master SHA: b3b298009baa21d5c5938dbb7ab43b9fdcdc5eee

Duplicate versions before: 1 (20260621120000 × 2 files)
Duplicate versions after: 0
Earlier migration retained: 20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
Later migration renamed from: 20260621120000_ig_auth_2e3_outbound_instagram_binding.sql
Later migration renamed to: 20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
Reconciliation migration: 20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
Maximum previous version: 20260621120000
Version selection reasoning: retain earlier 2D; +10000 steps for 2E.3 and reconcile

2E.3 SQL equivalence: PASS (git show 43b98fb normalized compare)
2D reconciliation behavior: idempotent ADD IF NOT EXISTS + constraint reconcile
Scenario A–E: documented in remediation doc

Schema parity: unchanged (already correct)
Migration uniqueness test: added
Local migration validation: test-suite only (no local Supabase reset)

Production access used: NO
Production migration executed: NO
Environment changes: NONE
Deployments: NONE
Provider calls: NONE
Outbound messages: NONE

Blocking issues: none (repository remediation complete)
Next required gate: merge PR → GO MIGRATION WINDOW with DB admin path

Scope confirmation:
IG-AUTH-2E.6C repository migration-version remediation only.
No production migration execution.
No production database access or migration-history edits.
No environment or feature-flag changes. No deployment.
No provider calls or outbound messages. No canary. No merge performed.
```
