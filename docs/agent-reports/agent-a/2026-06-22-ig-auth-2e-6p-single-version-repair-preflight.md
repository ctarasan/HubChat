# IG-AUTH-2E.6P — Merge Remediation and Single-Version Repair Preflight

> **Agent:** A  
> **Date:** 2026-06-22  
> **Task:** IG-AUTH-2E.6P  
> **Status:** Local evidence only — **not committed to master** (await docs PR / operator gate)

---

## Summary

PR #273 merged at reviewed exact SHA. Latest master verified clean. Read-only migration-list and production data-effect preflight complete. **Single-version repair not executed.**

**Decision: READY FOR OPERATOR GO SINGLE-VERSION REPAIR**

**Operational state:** HOLD — NO REPAIR, NO DRY-RUN, NO EXECUTION until explicit `GO SINGLE-VERSION REPAIR 20260501120000`.

---

## Phase 1 — PR #273 merge

| Field | Value |
| --- | --- |
| PR | #273 |
| Reviewed exact SHA | `d056d8f52f7d95bf498938c78747937e9ae6201d` |
| Pre-merge `headRefOid` | `d056d8f52f7d95bf498938c78747937e9ae6201d` (match) |
| Checks | Vercel SUCCESS |
| Mergeable | MERGEABLE |
| Merge method | merge commit (`gh pr merge 273 --merge`) |
| Merge commit SHA | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| PR state after merge | MERGED |
| Merged at | 2026-06-22T04:42:53Z |

---

## Phase 2 — Master sync (Agent A)

| Check | Result |
| --- | --- |
| Agent A synced master | YES |
| Agent B synced master | NO (Agent B must sync after notification) |
| Latest master SHA | `2c5386230cd98f957b1dbc098f53db51c032cae8` |
| `20260501120000_reclassify…` present | YES |
| `20260430_reclassify…` absent | YES |
| `20260431120000_reclassify…` absent | YES |

---

## Phase 3 — Repository verification

### Duplicate version scan

No duplicate migration version prefixes.

### Targeted tests

```text
node --import tsx --test src/lib/supabaseMigrationVersionUniqueness.test.ts
12/12 PASS
```

### SQL checksums

| File | SHA256 |
| --- | --- |
| `20260501120000_reclassify_invalid_facebook_dm_threads.sql` | `0782ae1a8e4f565f421b7e9a0b46e311a2accab4deb47a04922e2952c412202b` |
| `20260430_add_conversation_ids_to_outbound_function.sql` (canonical) | `dc051f15855fbd9886a634788fb8b045a8c8e13076cbb8eb7f53f6049249eb1c` |

### Five protected pending migrations (unchanged)

| Version | SHA256 prefix |
| --- | --- |
| `20260620120000` | `b4ddab7340da03fa…` |
| `20260621120000` | `faffa882f0b05113…` |
| `20260621130000` | `0db03064e0283c29…` |
| `20260621140000` | `83a7958b93b4d423…` |
| `20260621150000` | `c809c8f38c017039…` |

---

## Phase 4 — Read-only migration list (`supabase migration list --linked`)

Target: SmartKorp production (linked project ref masked in CLI output).

| Version | Local | Remote | Notes |
| --- | --- | --- | --- |
| `20260430` | present | applied | Canonical function migration |
| `20260501120000` | present | blank | **Pending repair candidate** |
| `20260506` | present | applied | CLI shows split rows due to `20260501120000` insertion; remote row applied, not a 7th pending |
| `20260620120000` | present | blank | Protected pending |
| `20260621120000` | present | blank | Protected pending |
| `20260621130000` | present | blank | Protected pending |
| `20260621140000` | present | blank | Protected pending |
| `20260621150000` | present | blank | Protected pending |

Expected six repair/dry-run pending versions before single-version repair:

```text
20260501120000
20260620120000
20260621120000
20260621130000
20260621140000
20260621150000
```

No unexpected remote-only versions beyond known `20260506` alignment artifact. No invalid `20260431120000` local file.

---

## Phase 5 — Read-only production data-effect verification

### Migration predicate (from `20260501120000_reclassify_invalid_facebook_dm_threads.sql`)

**Target table/columns:** `public.conversations` — `provider_thread_type`, `updated_at`

**UPDATE (historical, idempotent):**

```sql
SET provider_thread_type = 'FACEBOOK_COMMENT', updated_at = now()
WHERE provider_thread_type = 'MESSENGER_DM'
  AND channel_type = 'FACEBOOK'
  AND provider_external_user_id IS NOT NULL
  AND (channel_thread_id IS NULL OR channel_thread_id NOT LIKE 'user:%')
```

**Expected final values:** affected rows should have `provider_thread_type = 'FACEBOOK_COMMENT'`.

### Read-only verification queries

All executed via `supabase db query --linked` wrapped in:

```sql
begin; set transaction read only; <SELECT>; rollback;
```

| Query | Result |
| --- | --- |
| Residual rows matching UPDATE predicate | **0** |
| Rows in expected final classification (same predicate shape, `FACEBOOK_COMMENT`) | 73 |
| Aggregate by `provider_thread_type` where `channel_type = 'FACEBOOK'` | `FACEBOOK_COMMENT`: 73; `MESSENGER_DM`: 188; `NULL`: 7 |

No raw customer content, tokens, provider IDs, or PII recorded.

**Residual rows requiring historical UPDATE = 0** — data effect fully present in production.

---

## Phase 6 — Repair eligibility checklist

| Criterion | Status |
| --- | --- |
| PR #273 merged | YES |
| Latest master clean | YES |
| Duplicate scan clean | YES |
| Calendar/uniqueness tests pass | YES (12/12) |
| Remote history lacks `20260501120000` | YES (remote blank) |
| SQL effect present in production | YES |
| Residual rows = 0 | YES |
| SQL checksum matches reviewed baseline | YES |
| Canonical `20260430` unchanged | YES |
| Five protected migrations unchanged | YES |
| No blocking migration-list divergence | YES |
| Repair / dry-run executed in this task | NO |

**Authorized repair version (only):** `20260501120000`  
**Stale invalid version (never use):** `20260431120000`

---

## Prohibited actions attestation

| Action | Executed |
| --- | --- |
| Remote history modified | NO |
| 20-version repair repeated | NO |
| Single-version repair | NO |
| `db push` | NO |
| `db push --linked --dry-run` | NO |
| Real migration execution | NO |

---

## PR #272 note (out of scope)

Do not merge PR #272 in this task. Agent B should rebase/update PR #272 on latest master and re-review docs-only diff.

---

## Completion report

```text
IG-AUTH-2E.6P RESULT

PR #273 reviewed SHA: d056d8f52f7d95bf498938c78747937e9ae6201d
PR #273 merge commit: 2c5386230cd98f957b1dbc098f53db51c032cae8
Latest master SHA: 2c5386230cd98f957b1dbc098f53db51c032cae8

Agent A synced master: YES
Agent B synced master: NO

Final migration present:
20260501120000_reclassify_invalid_facebook_dm_threads.sql

Old duplicate file absent: YES
Invalid 20260431120000 file absent: YES
Duplicate scan clean: YES
Targeted tests: 12/12 PASS
SQL SHA-256: 0782ae1a8e4f565f421b7e9a0b46e311a2accab4deb47a04922e2952c412202b
Canonical 20260430 unchanged: YES
Five protected migrations unchanged: YES

Remote migration list:
- 20260430: local present / remote applied
- 20260501120000: local present / remote blank
- 20260620120000: local present / remote blank
- 20260621120000: local present / remote blank
- 20260621130000: local present / remote blank
- 20260621140000: local present / remote blank
- 20260621150000: local present / remote blank
- Unexpected divergence: NO (20260506 split-row display only; remote applied)

Historical data effect:
- Exact predicate reviewed: YES
- Residual rows requiring update: 0
- Expected final state confirmed: YES
- Query was read-only: YES

Remote history modified: NO
20-version repair repeated: NO
Single-version repair executed: NO
db push executed: NO
db push dry-run executed: NO
Real migration executed: NO

Decision:
READY FOR OPERATOR GO SINGLE-VERSION REPAIR

Operational state:
HOLD — NO REPAIR, NO DRY-RUN, NO EXECUTION
```
