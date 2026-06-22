# IG-AUTH-2E.6O Repository-Safe Remediation — Duplicate Migration Version `20260430`

> **Agent:** A
> **Date:** 2026-06-22
> **Task:** IG-AUTH-2E.6O
> **Branch:** `fix/ig-auth-2e-6o-20260430-migration-conflict`
> **Base master SHA:** `0f31fa7230c33eac5acf63bd561c66c9b135f57d`

---

## Summary

Repository-only remediation for legacy duplicate migration version key `20260430`. The data migration file received a unique **14-digit** version (`20260501120000`) via `git mv` with **byte-for-byte SQL preserved**. Canonical remote history row `20260430` remains mapped to the function migration file unchanged.

**Decision: READY FOR AGENT B EXACT-SHA RE-REVIEW**

No production mutation. No dry-run. No migration repair. No migration execution.

---

## Correction history (IG-AUTH-2E.6O-C)

| Attempt | Version | Outcome |
| --- | --- | --- |
| Initial (2E.6O) | `20260430120000` | Rejected — lexicographic sort before canonical `20260430_add…` |
| Second (2E.6O) | `20260431120000` | **Agent B CHANGES REQUIRED** at SHA `1d96ecc` — invalid calendar date (2026-04-31) |
| Final (2E.6O-C) | `20260501120000` | Valid UTC `2026-05-01 12:00:00`; collision scan clean; calendar test added |

Prior invalid versions are retained in audit history; not deleted from this report.

---

## Duplicate `20260430` files

| Filename | SHA256 | SQL role | First commit |
| --- | --- | --- | --- |
| `20260430_add_conversation_ids_to_outbound_function.sql` | `dc051f15855f…` | `CREATE OR REPLACE FUNCTION create_outbound_message_with_outbox` (+ `conversationIds` outbox field) | `575af2b` 2026-04-30 09:47 |
| `20260430_reclassify_invalid_facebook_dm_threads.sql` → **`20260501120000_reclassify_invalid_facebook_dm_threads.sql`** | `0782ae1a8e4f…` (unchanged) | `UPDATE conversations` reclassify invalid Facebook DM threads | `bc3db79` 2026-04-30 11:10 |

**Not byte-identical duplicates** — two distinct migrations accidentally sharing one version prefix.

---

## Git history

### Canonical function file

```text
575af2b 2026-04-30 09:47 A 20260430_add_conversation_ids_to_outbound_function.sql
8043cd2 2026-04-30 10:02 M  (parameter defaults fix)
```

### Data file (renamed in this task)

```text
bc3db79 2026-04-30 11:10 A 20260430_reclassify_invalid_facebook_dm_threads.sql
→ git mv to 20260501120000_reclassify_invalid_facebook_dm_threads.sql (2E.6O-C; was 20260431120000)
```

No prior renames on either file.

---

## Schema objects

| File | Objects |
| --- | --- |
| Function migration | `create_outbound_message_with_outbox` (16-param evolution superseded by later migrations; April effect: `conversationIds` in outbox payload) |
| Data migration | `public.conversations` rows: `MESSENGER_DM` → `FACEBOOK_COMMENT` for invalid Facebook DM thread pattern |

---

## Dependency analysis

| Order | Migration | Depends on |
| --- | --- | --- |
| 1 | `20260430_add_conversation_ids…` | Prior outbound RPC baseline |
| 2 | `20260501120000_reclassify…` (was shared `20260430`) | `conversations` table + provider thread columns (from earlier foundation) |
| 3 | `20260506…` | Subsequent indexes / provider thread work |

Filename lexicographic sort after remediation:

```text
20260430_add_conversation_ids…  →  20260501120000_reclassify…  →  20260506…
```

Verified by repository test and Node sort check (`0 < 1 < 2` indices).

---

## Remote migration-list evidence (sanitized)

`supabase migration list --linked` (read-only, 2026-06-22):

| Observation | Result |
| --- | --- |
| Target | SmartKorp production (`dsky…hyx`) |
| Remote `20260430` | **Applied** (one unique row) |
| Pre-remediation second local `20260430` row | Remote **blank** (orphan) |
| Protected pending five | Remote **blank** |
| Remote history modified this task | **NO** |

---

## Root cause

1. Two distinct April 2026 migrations were authored with the **same version prefix** `20260430`.
2. `GO MIGRATION HISTORY RECONCILIATION` correctly inserted **one** remote row for version `20260430` (20 unique versions).
3. Supabase CLI orders local files lexicographically; the second file sharing `20260430` could not be represented in remote history.
4. `db push --linked --dry-run` failed with ordering conflict on `20260430_reclassify_invalid_facebook_dm_threads.sql` (documented in PR #270 / #271).

---

## Canonical historical migration determination

| Role | File | Reason |
| --- | --- | --- |
| **Canonical for remote `20260430`** | `20260430_add_conversation_ids_to_outbound_function.sql` | First committed (09:47); maps to single remote `20260430` repair row; function effect audited PRESENT_EQUIVALENT (PR #264) |
| **Distinct data migration (orphan version key)** | `20260430_reclassify…` → `20260501120000_reclassify…` | Second commit (11:10); different SQL; remote blank pre-remediation; DATA_STATE_CONFIRMED in production (PR #264) |

---

## Remediation chosen

**Version-key normalization via `git mv` only** (SQL byte-for-byte unchanged):

```text
20260430_reclassify_invalid_facebook_dm_threads.sql
  → 20260501120000_reclassify_invalid_facebook_dm_threads.sql
```

Version `20260501120000` selected because:

- Valid UTC calendar date (`2026-05-01 12:00:00`) — verified by `isValidUtcMigrationTimestamp` test
- Unique 14-digit timestamp (not used elsewhere)
- Lexicographic sort **after** `20260430_add…` and **before** `20260506…`
- Does not collide with five protected pending versions
- Preserves dependency ordering (data migration after function migration, before May 6 work)

**Rejected alternatives:**

| Alternative | Why rejected |
| --- | --- |
| Repeat 20-version repair | Explicitly prohibited; would not add second `20260430` row |
| Delete historical file | Prohibited; destroys audit traceability |
| Edit SQL of applied/pending migrations | Prohibited |
| Rename canonical function file | Would diverge from remote `20260430` key |

---

## Repository safety

| Check | Result |
| --- | --- |
| SQL content of renamed file | **Unchanged** (SHA256 `0782ae1a8e4f…`) |
| SQL content of canonical `20260430` file | **Unchanged** (SHA256 `dc051f15855f…`) |
| Five pending migrations | **Unchanged** (checksums match pre-remediation) |
| Remote history | **Not modified** |
| `20260621150000` reconciliation migration | **Unchanged** (still pending; embeds data predicate) |

---

## Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/20260501120000_reclassify_invalid_facebook_dm_threads.sql` | Renamed from `20260430_reclassify…` (`git mv`; was `20260431120000` in prior commit) |
| `src/lib/supabaseMigrationVersionUniqueness.test.ts` | Calendar validation + path/ordering tests |

---

## Five pending migration checksums (unchanged)

| File | SHA256 |
| --- | --- |
| `20260620120000_ig_auth_2c_instagram_oauth_states.sql` | `b4ddab7340da…` |
| `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` | `faffa882f0b0…` |
| `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` | `0db03064e028…` |
| `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` | `83a7958b93b4…` |
| `20260621150000_legacy_20260430_reconciliation.sql` | `c809c8f38c01…` |

---

## Duplicate-version scan (post-remediation)

14-digit prefix scan (automated test): **0 duplicates**

Calendar validation (14-digit versions): **all pass**; rejects `20260431120000` and other invalid dates

Legacy `20260430` prefix: **1 file only** (`20260430_add_conversation_ids…`)

PowerShell version-prefix grouping: **no groups with Count > 1**

---

## Commands executed

| Command | Purpose |
| --- | --- |
| `git fetch` / `git switch master` / `git pull` | Sync base |
| `find` / `Get-ChildItem` migration listing | Inventory |
| `Get-FileHash` / `sha256sum` equivalents | Checksums |
| `git log --follow` | History |
| `supabase migration list --linked` | Read-only remote evidence |
| `git mv` | Version rename |
| `node --import tsx --test src/lib/supabaseMigrationVersionUniqueness.test.ts` | Verification |

---

## Prohibited commands (confirmed NOT run)

```text
supabase migration repair
supabase db push
supabase db push --linked --dry-run
supabase db reset
supabase migration up
```

---

## Risk assessment

| Risk | Mitigation |
| --- | --- |
| New version `20260501120000` not yet in remote history | **Expected.** Separate single-version repair authorization required before dry-run PASS — **not** a repeat of 20-version repair |
| Dry-run may list 6 files until `20260501120000` marked applied | Document for operator; data UPDATE is idempotent; production effect already present |
| Filename sort regression | Covered by automated ordering test |

---

## Post–Agent B / operator note (out of scope for 2E.6O)

After Agent B PASS, operator may authorize **one** additional history repair:

```text
migration repair 20260501120000 --status applied --linked
```

This is **not** repeating the 20-version repair. Production data effect is already applied (PR #264 audit residual 0). Only then should dry-run be attempted in a separate approved window.

---

## Final decision

**READY FOR AGENT B EXACT-SHA RE-REVIEW**

---

## Completion report

```text
IG-AUTH-2E.6O-C CORRECTION RESULT

PR: #273
Previous reviewed SHA: 1d96ecc90e2a199630ecffb2d5b49b9b1232f3e6
New exact SHA: (pending)
Branch: fix/ig-auth-2e-6o-20260430-migration-conflict

Previous invalid version: 20260431120000 (2026-04-31)
Final valid version: 20260501120000 (2026-05-01 12:00:00 UTC)

Calendar date verified: YES
Version collision scan clean: YES
Ordering after canonical 20260430: YES
Ordering before 20260506: YES
SQL byte-for-byte preserved: YES (0782ae1a8e4f…)
Rename detected as R100: YES
Canonical 20260430 migration unchanged: YES
Five protected pending migrations unchanged: YES
Calendar validation test added: YES
Invalid date cases rejected: YES
Relevant tests: 12/12 pass

Remote history modified: NO
20-version repair repeated: NO
Migration repair executed: NO
db push executed: NO
db push dry-run executed: NO
Real migration executed: NO

Decision: READY FOR AGENT B EXACT-SHA RE-REVIEW

Operational state:
HOLD — NO DRY-RUN, NO REPAIR, NO EXECUTION, DO NOT MERGE
```

---

## Prior completion report (IG-AUTH-2E.6O, superseded by 2E.6O-C)

```text
IG-AUTH-2E.6O RESULT

Base master SHA: 0f31fa7230c33eac5acf63bd561c66c9b135f57d
Branch: fix/ig-auth-2e-6o-20260430-migration-conflict
Final commit SHA: af4e3b3
PR URL: https://github.com/ctarasan/HubChat/pull/273

Duplicate files found:
- 20260430_add_conversation_ids_to_outbound_function.sql (canonical)
- 20260430_reclassify_invalid_facebook_dm_threads.sql (renamed)

Remote history evidence:
- 20260430 applied once; second local row was blank; five protected pending blank

Root cause:
- accidental shared version key on two distinct migrations

Canonical historical migration:
- 20260430_add_conversation_ids_to_outbound_function.sql

Local-only or accidental duplicate:
- shared version key on data migration (not byte-identical duplicate)

Remediation:
- git mv to 20260431120000_reclassify_invalid_facebook_dm_threads.sql

Files changed:
- supabase/migrations/20260431120000_reclassify_invalid_facebook_dm_threads.sql (rename)
- src/lib/supabaseMigrationVersionUniqueness.test.ts

20260430 conflict resolved locally: YES
Duplicate migration versions remaining: NO
Five pending migrations present: YES
Five pending migration checksums unchanged: YES
Migration SQL content changed: NO
Remote history modified: NO
20-version repair repeated: NO
Migration repair executed: NO
db push executed: NO
db push dry-run executed: NO
Real migration executed: NO

Verification:
- git diff --check: clean
- duplicate-version scan: pass
- checksum comparison: pass
- secret scan: pass

Decision: READY FOR AGENT B REVIEW

Risks or notes:
- future single-version repair 20260431120000 required before EXACT_FIVE_PENDING dry-run
```

---

## Scope confirmation

```text
IG-AUTH-2E.6O repository-safe remediation only.
No remote history mutation. No migration execution. No dry-run.
HOLD — NO DB PUSH DRY-RUN AND NO REAL MIGRATION EXECUTION until Agent B reviews exact SHA.
```
