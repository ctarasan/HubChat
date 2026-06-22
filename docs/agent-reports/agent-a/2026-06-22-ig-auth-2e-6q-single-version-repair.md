# IG-AUTH-2E.6Q — Controlled Single-Version Migration-History Repair

> **Agent:** A  
> **Date:** 2026-06-22  
> **Task:** IG-AUTH-2E.6Q  
> **Branch:** `docs/ig-auth-2e-6q-single-version-repair` (docs-only; not on master)

---

## Operator authorization

```text
GO SINGLE-VERSION REPAIR 20260501120000
```

Authorized version only: `20260501120000`  
Prohibited versions: `20260430`, `20260430120000`, `20260431120000`

---

## Execution context

| Field | Value |
| --- | --- |
| Execution master SHA | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| PR #273 merge commit | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| CLI version | `2.98.2` |
| Execution timestamp UTC | `2026-06-22T04:56:56Z` |
| Migration file | `supabase/migrations/20260501120000_reclassify_invalid_facebook_dm_threads.sql` |
| SQL SHA-256 (pre-execute) | `0782ae1a8e4f565f421b7e9a0b46e311a2accab4deb47a04922e2952c412202b` |
| Exclusive operator | Agent A (no concurrent migration operations detected) |

---

## Pre-repair migration list (sanitized)

Command: `supabase migration list --linked`

| Version | Local | Remote |
| --- | --- | --- |
| `20260430` | present | applied |
| `20260501120000` | present | **blank** |
| `20260506` | present | applied (split-row display artifact) |
| `20260620120000` | present | blank |
| `20260621120000` | present | blank |
| `20260621130000` | present | blank |
| `20260621140000` | present | blank |
| `20260621150000` | present | blank |

Protected pending count before repair: **5**  
Unexpected divergence: **NO** (known `20260506` split-row only)

---

## Command executed

```bash
supabase migration repair 20260501120000 --status applied --linked
```

| Field | Value |
| --- | --- |
| Exit code | `0` |
| Sanitized stdout | `Finished supabase migration repair.` / `Repaired migration history: [20260501120000] => applied` |
| Sanitized stderr | CLI update notice only (no secrets) |
| SQL migration executed | **NO** (history record insert only) |

---

## Post-repair migration list (sanitized)

Command: `supabase migration list --linked`

| Version | Local | Remote |
| --- | --- | --- |
| `20260430` | present | applied |
| `20260501120000` | present | **applied** |
| `20260506` | present | applied (alignment restored — split row resolved) |
| `20260620120000` | present | blank |
| `20260621120000` | present | blank |
| `20260621130000` | present | blank |
| `20260621140000` | present | blank |
| `20260621150000` | present | blank |

Protected pending count after repair: **5**  
Unexpected divergence: **NO**

Local-only versions remaining: exactly the five protected pending migrations.

---

## Production data state (read-only, post-repair)

Query (read-only transaction + rollback):

```sql
SELECT count(*)::int AS residual_count
FROM public.conversations
WHERE provider_thread_type = 'MESSENGER_DM'
  AND channel_type = 'FACEBOOK'
  AND provider_external_user_id IS NOT NULL
  AND (channel_thread_id IS NULL OR channel_thread_id NOT LIKE 'user:%');
```

| Metric | Value |
| --- | --- |
| Residual rows requiring reclassification | **0** |
| Production data changed by repair | **NO** (history-only write) |

Pre-repair residual (2E.6P): 0 — unchanged.

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| 20-version repair repeated | NO |
| Other version repaired | NO |
| `db push` | NO |
| `db push --linked --dry-run` | NO |
| `migration up` | NO |
| `db reset` | NO |
| Real migration SQL executed | NO |
| Protected pending migrations touched | NO |

---

## Final decision

```text
SINGLE-VERSION REPAIR PASS
```

**Operational state:** HOLD — NO DRY-RUN AND NO MIGRATION EXECUTION

Dry-run requires separate operator authorization.

---

## Completion report

```text
IG-AUTH-2E.6Q SINGLE-VERSION REPAIR RESULT

Authorization:
GO SINGLE-VERSION REPAIR 20260501120000

Execution master SHA: 2c5386230cd98f957b1dbc098f53db51c032cae8
CLI version: 2.98.2
Execution timestamp UTC: 2026-06-22T04:56:56Z

Pre-repair:
- 20260501120000 local: present
- 20260501120000 remote: blank
- Protected pending count: 5
- Unexpected divergence: NO

Command executed:
supabase migration repair 20260501120000 --status applied --linked

Command exit code: 0
Sanitized result: Repaired migration history: [20260501120000] => applied

Post-repair:
- 20260430: local present / remote applied
- 20260501120000: local present / remote applied
- 20260620120000: local present / remote blank
- 20260621120000: local present / remote blank
- 20260621130000: local present / remote blank
- 20260621140000: local present / remote blank
- 20260621150000: local present / remote blank
- Protected pending count: 5
- Unexpected divergence: NO

Residual rows requiring reclassification: 0
Production data changed by repair: NO

20-version repair repeated: NO
Other version repaired: NO
db push executed: NO
db push dry-run executed: NO
migration up executed: NO
Real migration executed: NO

Decision:
SINGLE-VERSION REPAIR PASS

Operational state:
HOLD — NO DRY-RUN AND NO MIGRATION EXECUTION
```
