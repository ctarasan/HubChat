# Agent B — IG-AUTH-2E.6O-B Pre-Review: `20260430` Migration Remediation

## Status

**CHANGES REQUIRED — INVALID CALENDAR TIMESTAMP** (exact-SHA review of Agent A PR #273 at `1d96ecc`). Pre-review baseline remains valid; remediation must use a real calendar timestamp.

Operational state remains: **HOLD — NO DB PUSH DRY-RUN AND NO REAL MIGRATION EXECUTION** (by Agent B).

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Deliverable | IG-AUTH-2E.6O-B |
| Date | 2026-06-22 |
| Branch | `docs/ig-auth-2e-6o-b-pre-review` |
| Base master SHA | `0f31fa7230c33eac5acf63bd561c66c9b135f57d` |
| Upstream | PR #270 (2E.6M repair), PR #271 (2E.6N review), PR #267 (legacy reconciliation migration) |
| Agent A remediation PR | **Not available** |

---

## IG-AUTH-2E.6O-B PRE-REVIEW RESULT

```text
Base master SHA: 0f31fa7230c33eac5acf63bd561c66c9b135f57d
Branch: docs/ig-auth-2e-6o-b-pre-review
Report commit SHA: (pending)
PR URL: (pending)

Duplicate files found:
- 20260430_add_conversation_ids_to_outbound_function.sql
- 20260430_reclassify_invalid_facebook_dm_threads.sql

Independent root-cause assessment:
Two distinct local migrations share version prefix 20260430. Supabase CLI records
one schema_migrations row per version key. After 20-version repair (PR #270), remote
has one applied 20260430 row while two local files remain. Dry-run fails planning
with orphaned second file (reclassify) — LEGACY_20260430_ORDERING_CONFLICT per PR #271.

Remote evidence: REMOTE EVIDENCE NOT INDEPENDENTLY VERIFIED (no Supabase CLI on
Agent B machine; no linked project). Relies on merged PR #270/#271 sanitized evidence.

Five pending migration baseline captured: YES
Migration files modified by Agent B: NO
Remote history modified: NO
Migration repair executed: NO
db push executed: NO
db push dry-run executed: NO
Real migration executed: NO

Decision: PRE-REVIEW READY

Waiting for Agent A:
- PR URL
- exact remediation SHA
- remediation evidence report

Risks or notes:
- Files are NOT byte-identical; different SQL objects/effects
- Renamed file must preserve SQL byte-for-byte; timestamp choice must not collide
- 5 pending migration checksums must remain unchanged in Agent A PR
- 20-version repair must not be repeated
- db push --dry-run remains HOLD until remediation merged and re-verified
```

---

## 1. Duplicate file inventory

| Filename | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `20260430_add_conversation_ids_to_outbound_function.sql` | 5035 | `dc051f15855fbd9886a634788fb8b045a8c8e13076cbb8eb7f53f6049249eb1c` |
| `20260430_reclassify_invalid_facebook_dm_threads.sql` | 640 | `0782ae1a8e4f565f421b7e9a0b46e311a2accab4deb47a04922e2952c412202b` |

| Property | File 1 (add_conversation_ids) | File 2 (reclassify) |
| --- | --- | --- |
| Byte-identical | **No** — distinct migrations | |
| SQL objects | `create or replace function create_outbound_message_with_outbox` (15-param; adds `p_conversation_ids`, `conversationIds` in outbox payload) | `UPDATE public.conversations` (reclassify invalid Facebook DM threads) |
| Destructive DDL | No | No (data UPDATE only) |
| Alphabetical sort order | **First** | **Second** |

---

## 2. Git history summary

### `20260430_add_conversation_ids_to_outbound_function.sql`

| Event | Commit | Date (+07) | Message |
| --- | --- | --- | --- |
| Added | `575af2b` | 2026-04-30 09:47 | fix: route facebook grouped outbound through messenger dm |
| Modified | `8043cd2` | 2026-04-30 10:02 | fix: correct outbound function parameter defaults |

No renames observed (`git log --follow --name-status`).

### `20260430_reclassify_invalid_facebook_dm_threads.sql`

| Event | Commit | Date (+07) | Message |
| --- | --- | --- | --- |
| Added | `bc3db79` | 2026-04-30 11:10 | fix: harden facebook dm routing target validation |

No renames observed.

### Chronological conclusion

1. **Earlier logical migration:** `add_conversation_ids` (function/RPC effect) — introduced first.
2. **Later logical migration:** `reclassify_invalid_facebook_dm_threads` (data cleanup) — introduced ~1h later same day.
3. Both share accidental duplicate version prefix `20260430` (8-digit legacy format).
4. Neither file was renamed before this pre-review.

---

## 3. Dependency assessment

### Objects created or modified

| Migration | Objects |
| --- | --- |
| `add_conversation_ids` | Function `create_outbound_message_with_outbox` — adds `p_conversation_ids` parameter and `conversationIds` in outbox JSON |
| `reclassify` | Data: `conversations.provider_thread_type` rows matching invalid Facebook DM predicate |

### Downstream references (later migrations)

| Later migration | Dependency on `20260430` effects |
| --- | --- |
| `20260506_instagram_provider_thread_and_indexes.sql` | Extends `conversations_provider_thread_type_valid` CHECK — uses `provider_thread_type` values including `FACEBOOK_COMMENT` (reclassify target) |
| `20260602154000_instagram_comment_provider_thread_type.sql` | Further extends same CHECK constraint |
| `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` | `CREATE OR REPLACE` on same RPC; preserves `conversationIds` from April migration |
| `20260621150000_legacy_20260430_reconciliation.sql` | Explicitly reconciles **both** April effects plus final 16-param RPC |

### Ordering constraints for remediation

| Rule | Evidence |
| --- | --- |
| Any renamed `20260430` file must remain **before** `20260506` | Filename sort order; RPC/conversation objects referenced downstream |
| Function migration logically **before** IG OAuth chain | `20260621130000` builds on outbound RPC |
| Reclassify does not depend on function migration SQL | Independent UPDATE; but same-day FB routing fix bundle |
| Renamed timestamp must not collide with existing prefixes | See §4 migration inventory |
| **Do not guess timestamp** in Agent B report | Agent A must derive from dependency evidence + collision scan |

### CLI dry-run failure (from PR #271 evidence)

Remote has **one** applied `20260430` row. CLI identifies orphaned local file:

```text
20260430_reclassify_invalid_facebook_dm_threads.sql
```

Suggests remote repair associated version key `20260430` with the first-applied/alphanumeric-first file (`add_conversation_ids`), leaving `reclassify` untracked locally.

---

## 4. Full migration ordering (local filenames)

Total: **26** files. Sorted excerpt around collision:

```text
20260430_add_conversation_ids_to_outbound_function.sql      ← duplicate prefix
20260430_reclassify_invalid_facebook_dm_threads.sql         ← duplicate prefix
20260506_instagram_provider_thread_and_indexes.sql          ← next unique version
...
20260620120000_ig_auth_2c_instagram_oauth_states.sql        ← pending
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
20260621150000_legacy_20260430_reconciliation.sql
```

### Duplicate version scan (all numeric prefixes)

| Prefix | Count | Files |
| --- | ---: | --- |
| `20260430` | **2** | add_conversation_ids, reclassify |
| 14-digit prefixes | **0 duplicates** | |

No other duplicate numeric prefixes on master.

---

## 5. Five pending migration baseline (checksums)

Captured at base `0f31fa7`. **Do not change** in Agent A remediation PR.

| Version | Filename | Size | SHA-256 |
| --- | --- | ---: | --- |
| `20260620120000` | `ig_auth_2c_instagram_oauth_states.sql` | 2396 | `b4ddab7340da03faab4b2eee7c082a1c3bc4951c06d681b22be876acf6107834` |
| `20260621120000` | `ig_auth_2d_instagram_oauth_identity_verification.sql` | 729 | `faffa882f0b051138658e6d133ce4eeeda6e133f8cf1a2a3e70b34d0548b050e` |
| `20260621130000` | `ig_auth_2e3_outbound_instagram_binding.sql` | 5589 | `0db03064e0283c29f8f089529c6634c51cc91618a2d6fe2b5f1ff67a6fde7068` |
| `20260621140000` | `ig_auth_2d_instagram_oauth_identity_reconcile.sql` | 873 | `83a7958b93b4d42381d2020547652c7618a8e84890ab006ef816aafd81cdb04e` |
| `20260621150000` | `legacy_20260430_reconciliation.sql` | 6484 | `c809c8f38c0170392b49e7626a00dd2c20c4e622c81ca2b2f5e0d2f472eff880` |

---

## 6. Remote evidence

| Check | Agent B result |
| --- | --- |
| `supabase migration list --linked` | **Not executed** — CLI not installed; project not linked on this machine |
| Classification | **REMOTE EVIDENCE NOT INDEPENDENTLY VERIFIED** |

Merged evidence from PR #270/#271 (sanitized, accepted for planning only):

| Item | Reported state |
| --- | --- |
| 20-version repair | Completed; do **not** repeat |
| Remote applied count | 20 unique versions |
| Remote `20260430` rows | **1** (one version key) |
| Five protected pending | Remote column blank for all five |
| Dry-run | Exit 1 — `LEGACY_20260430_ORDERING_CONFLICT` |

---

## 7. Review acceptance checklist (final exact-SHA review)

Agent B will **PASS** Agent A remediation only if all are verified at exact SHA:

| # | Criterion |
| --- | --- |
| 1 | Review exact SHA stated explicitly |
| 2 | Base SHA is master after PR #270 and #271 (`0f31fa7` or later as specified) |
| 3 | Root cause of duplicate `20260430` documented with evidence |
| 4 | Canonical historical migration identified (likely `add_conversation_ids` — first introduced, matches remote repair slot) |
| 5 | File receiving new version is local-only/orphan (likely `reclassify`) |
| 6 | Applied migration SQL **not** modified in place |
| 7 | Renamed file SQL **byte-for-byte** identical to baseline checksum above |
| 8 | Dependency ordering preserved (renamed file before `20260506`) |
| 9 | No new duplicate migration versions (full prefix scan) |
| 10 | All 5 pending migrations present with **unchanged** checksums |
| 11 | Checksums match §5 baseline exactly |
| 12 | Remote migration history **not** modified by remediation PR |
| 13 | 20-version repair **not** repeated |
| 14 | No `migration repair` in remediation phase |
| 15 | No `db push` |
| 16 | No `db push --linked --dry-run` |
| 17 | No real migration execution |
| 18 | Diff limited to remediation + related evidence/docs |
| 19 | No secrets in diff/report |
| 20 | PR not merged before review |

Any unprovable item ⇒ **BLOCK** or **HOLD**.

---

## 8. Known risks

| Risk | Notes |
| --- | --- |
| Wrong file renamed | Could orphan `add_conversation_ids` instead of `reclassify` |
| Timestamp collision | New prefix must not match any existing migration |
| SQL drift during rename | Must be byte-for-byte; verify SHA-256 |
| Pending checksum drift | Any change to 5 protected files is **BLOCKED** |
| Repeat history repair | Forbidden — 20 versions already applied |
| `--include-all` workaround | Not authorized without separate review |
| `20260621150000` reconciliation | Must remain pending; bundles both April effects for forward apply |

---

## 9. Waiting for Agent A

| Item | Status |
| --- | --- |
| Remediation PR URL | Pending |
| Exact remediation SHA | Pending |
| Chosen rename strategy and timestamp | Pending |
| Evidence report | Pending |

When received, Agent B will:

```bash
git fetch origin
git switch --detach <AGENT_A_EXACT_SHA>
git rev-parse HEAD
git diff --check origin/master...HEAD
git diff --stat origin/master...HEAD
# verify 5 pending checksums vs §5 baseline
# verify duplicate prefix scan
```

**No dry-run** even if review passes.

---

## 10. Scope confirmation

IG-AUTH-2E.6O-B independent read-only pre-review only. No migration files modified by Agent B. No migration repair, db push, dry-run, reset, or remote history edits. No merge. No secrets captured.

---

## 11. IG-AUTH-2E.6O-B2 — Exact-SHA review (PR #273)

### IG-AUTH-2E.6O-B2 EXACT-SHA REVIEW

```text
PR: https://github.com/ctarasan/HubChat/pull/273
Reviewed exact SHA: 1d96ecc90e2a199630ecffb2d5b49b9b1232f3e6
Base SHA: 0f31fa7230c33eac5acf63bd561c66c9b135f57d
Detached HEAD verified: YES

Files reviewed:
- supabase/migrations/20260431120000_reclassify_invalid_facebook_dm_threads.sql (R100 rename)
- src/lib/supabaseMigrationVersionUniqueness.test.ts
- docs/agent-reports/agent-a/2026-06-22-ig-auth-2e-6o-20260430-remediation.md

SQL byte-for-byte preserved: YES (git R100; SHA-256 0782ae1a8e4f…)
Canonical 20260430 file unchanged: YES (SHA-256 dc051f15855f…)
Five pending migrations unchanged: YES (all five checksums match §5 baseline)
Duplicate version scan clean: YES (zero duplicate prefixes)
Calendar timestamp valid: NO — 20260431120000 = 2026-04-31 12:00:00 (invalid date)
Calendar validation test present: NO (regex-only 14-digit check; accepts invalid dates)
Remote history modified: NO
Migration repair executed: NO
db push dry-run executed: NO
Real migration executed: NO

Blocking finding:
- 20260431120000 represents invalid calendar date 2026-04-31 12:00:00

Decision:
CHANGES REQUIRED — INVALID CALENDAR TIMESTAMP

Required remediation:
- Replace with a unique, dependency-safe, real calendar timestamp after
  legacy 20260430 and before 20260506
- Preserve SQL byte-for-byte
- Add calendar-validity test (parse UTC, round-trip serialize, reject invalid dates)
- Push new commit and provide new exact SHA for re-review

Operational state:
HOLD — NO DRY-RUN, NO REPAIR, NO EXECUTION, DO NOT MERGE PR #273
```

### Scope gate

| Check | Result |
| --- | --- |
| Files changed | 3 (rename, test, docs) |
| Unexpected runtime/config changes | **None** |
| `git diff --check` | **Clean** |
| Rename detection | `R100` — `20260430_reclassify…` → `20260431120000_reclassify…` |

### Positive findings (insufficient for PASS)

| Criterion | Result |
| --- | --- |
| Rename strategy (orphan data file) | Correct — canonical `add_conversation_ids` retained at `20260430` |
| SQL content preserved | Yes — git similarity 100%; on-disk SHA `0782ae1a8e4f…` matches baseline |
| Lexicographic ordering | `20260430` < `20260431120000` < `20260506` |
| Five protected pending migrations | Unchanged — all checksums match pre-review baseline |
| Duplicate prefix scan | Zero duplicates |
| Migration tests | 11/11 PASS at `1d96ecc` |
| Prohibited actions | None attested (repair, push, dry-run, execution) |
| Secret scan | PASS |

### Blocking: invalid calendar timestamp

Agent A chose `20260431120000` parsed as `YYYYMMDDHHMMSS`:

| Component | Value | Valid? |
| --- | --- | --- |
| Year | 2026 | Yes |
| Month | 04 | Yes |
| Day | **31** | **No** — April has 30 days |
| Time | 12:00:00 | N/A — date invalid |

Supabase migration filenames use 14-digit timestamps as version keys. An invalid calendar date is not acceptable even when lexical sort passes and uniqueness tests pass.

Current test at `1d96ecc` line 172 **asserts** `extractTimestampVersion(names[idxData]) === "20260431120000"` — this encodes the invalid timestamp as expected behavior. Coverage gap confirmed.

### Tests must reject (examples)

```text
20260431120000  — April 31
20260230000000  — February 30
20261301000000  — Month 13
20260101246000  — Hour 24
```

### Agent B did not run

`supabase migration repair`, `db push`, `db push --linked --dry-run`, `db reset`, `migration up`, or any migration execution.
