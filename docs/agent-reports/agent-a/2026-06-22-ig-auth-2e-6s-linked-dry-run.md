# IG-AUTH-2E.6S — Controlled Linked Database Push Dry-Run

> **Agent:** A
> **Date:** 2026-06-22
> **Task:** IG-AUTH-2E.6S
> **Branch:** `docs/ig-auth-2e-6q-single-version-repair` (docs-only; not on master)

---

## Operator authorization

```text
GO DB PUSH LINKED DRY-RUN
```

Authorized command only: `supabase db push --linked --dry-run` (single execution, no extra flags)

---

## Execution context

| Field | Value |
| --- | --- |
| Execution master SHA | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| CLI version | `2.98.2` |
| Execution timestamp UTC | `2026-06-22T05:23:27Z` |
| Exclusive operator | Agent A (no concurrent database operations detected) |
| Repaired version (pre-existing) | `20260501120000` => applied |

---

## Pre-dry-run migration list (sanitized)

Command: `supabase migration list --linked`

| Version | Local | Remote |
| --- | --- | --- |
| `20260430` | present | applied |
| `20260501120000` | present | applied |
| `20260506` | present | applied |
| `20260620120000` | present | blank |
| `20260621120000` | present | blank |
| `20260621130000` | present | blank |
| `20260621140000` | present | blank |
| `20260621150000` | present | blank |

Protected pending count: **5**
Unexpected divergence: **NO**

---

## Protected migration checksums (full SHA-256)

| Version | SHA-256 |
| --- | --- |
| `20260620120000` | `b4ddab7340da03faab4b2eee7c082a1c3bc4951c06d681b22be876acf6107834` |
| `20260621120000` | `faffa882f0b051138658e6d133ce4eeeda6e133f8cf1a2a3e70b34d0548b050e` |
| `20260621130000` | `0db03064e0283c29f8f089529c6634c51cc91618a2d6fe2b5f1ff67a6fde7068` |
| `20260621140000` | `83a7958b93b4d42381d2020547652c7618a8e84890ab006ef816aafd81cdb04e` |
| `20260621150000` | `c809c8f38c0170392b49e7626a00dd2c20c4e622c81ca2b2f5e0d2f472eff880` |

All match Agent B baseline. Unchanged: **YES**

---

## Dry-run command executed

```bash
supabase db push --linked --dry-run
```

| Field | Value |
| --- | --- |
| Exit code | `0` |
| Sanitized stdout | `DRY RUN: migrations will *not* be pushed to the database.` / `Finished supabase db push.` / `Would push these migrations:` (5 listed below) |
| Sanitized stderr | CLI update notice only (no secrets) |
| Real migration executed | **NO** |

### Proposed migrations in order

| # | Version | Filename |
| --- | --- | --- |
| 1 | `20260620120000` | `20260620120000_ig_auth_2c_instagram_oauth_states.sql` |
| 2 | `20260621120000` | `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` |
| 3 | `20260621130000` | `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` |
| 4 | `20260621140000` | `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |
| 5 | `20260621150000` | `20260621150000_legacy_20260430_reconciliation.sql` |

Unexpected migration proposed: **NO**
Repaired `20260501120000` proposed: **NO**
Duplicate/version-ordering error: **NO**
Repair recommendation shown: **NO**

---

## Post-dry-run migration list (sanitized)

Command: `supabase migration list --linked`

| Version | Local | Remote |
| --- | --- | --- |
| `20260501120000` | present | applied |
| `20260620120000` | present | blank |
| `20260621120000` | present | blank |
| `20260621130000` | present | blank |
| `20260621140000` | present | blank |
| `20260621150000` | present | blank |

Protected pending count: **5**
Remote history changed during dry-run: **NO**
Schema or data execution observed: **NO**

Post-dry-run state identical to pre-dry-run.

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| 20-version repair repeated | NO |
| Additional repair executed | NO |
| `db push` without `--dry-run` | NO |
| `migration up` | NO |
| Real migration executed | NO |
| `db reset` / `db pull` / `db diff --linked` | NO |

---

## Final decision

```text
DRY-RUN PASS
```

**Operational state:** HOLD — NO REAL MIGRATION EXECUTION

Real `supabase db push --linked` requires separate authorization after independent review.

---

## Completion report

```text
IG-AUTH-2E.6S LINKED DRY-RUN RESULT

Authorization:
GO DB PUSH LINKED DRY-RUN

Execution master SHA: 2c5386230cd98f957b1dbc098f53db51c032cae8
CLI version: 2.98.2
Execution timestamp UTC: 2026-06-22T05:23:27Z

Pre-dry-run:
- 20260430: local present / remote applied
- 20260501120000: local present / remote applied
- Protected pending count: 5
- Unexpected divergence: NO

Command executed:
supabase db push --linked --dry-run

Command exit code: 0

Proposed migrations in order:
1. 20260620120000
2. 20260621120000
3. 20260621130000
4. 20260621140000
5. 20260621150000

Unexpected migration proposed: NO
Repaired 20260501120000 proposed: NO
Duplicate/version-ordering error: NO
Repair recommendation shown: NO

Post-dry-run:
- 20260501120000: local present / remote applied
- Protected pending count: 5
- Remote history changed: NO
- Schema or data execution observed: NO

Protected migration checksums unchanged: YES

20-version repair repeated: NO
Additional repair executed: NO
db push without dry-run executed: NO
migration up executed: NO
Real migration executed: NO

Decision:
DRY-RUN PASS

Operational state:
HOLD — NO REAL MIGRATION EXECUTION
```
