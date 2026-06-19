# Agent B — IG-AUTH-2E.6D Migration Version Collision Audit and Review Prep

## Status

**Audit prep complete** — duplicate migration version confirmed on master. Agent A remediation PR **not yet published** at audit time. This document defines independent acceptance gates for the forthcoming remediation PR.

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Deliverable | IG-AUTH-2E.6-D |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2e-6d-migration-collision-review` |
| Base master SHA | `b3b298009baa21d5c5938dbb7ab43b9fdcdc5eee` |
| Upstream blocker evidence | PR #258 (2E.6A HOLD), PR #259 (2E.6B PASS WITH NOTES) |
| Agent A remediation PR | **Not available** at audit time |

---

## Collision confirmation

Independent scan of `supabase/migrations/*.sql` (24 files):

| Metric | Value |
| --- | --- |
| Total migration files | 24 |
| Duplicate numeric prefixes | **1** |
| Duplicate version | `20260621120000` |
| Duplicate count | **2** |
| Maximum version prefix | `20260621120000` |

### Duplicate filenames

| File | Phase | Version prefix |
| --- | --- | --- |
| `20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql` | IG-AUTH-2D | `20260621120000` |
| `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` | IG-AUTH-2E.3 | `20260621120000` |

### Ordering around IG-AUTH-2D and 2E.3

Chronological migration chain (IG-AUTH slice):

```text
20260619120000_ig_auth_2a_instagram_oauth_credential_foundation.sql
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql   ← collision
20260621120000_ig_auth_2e3_outbound_instagram_binding.sql              ← collision
```

No later migration files exist after the collision pair. Renamed 2E.3 and any reconciliation migration must use a version **strictly greater than** `20260621120000`.

---

## Git-history result

| File | Introduced | Commit | PR | Date (+07) |
| --- | --- | --- | --- | --- |
| `…_2d_instagram_oauth_identity_verification.sql` | **First** | `91ae0ef` | #247 | 2026-06-19 08:57 |
| `…_2e3_outbound_instagram_binding.sql` | **Second** | `43b98fb` | #254 | 2026-06-19 12:27 |

### Conclusions

1. **Earlier logical phase:** IG-AUTH-2D (identity metadata on `instagram_oauth_credentials`).
2. **Later logical phase:** IG-AUTH-2E.3 (outbound RPC binding parameter).
3. **Collision introduced when:** PR #254 added the 2E.3 file reusing the same timestamp prefix already assigned to 2D in PR #247.
4. **Prior evidence references:** Multiple docs cite `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` as the approved 2E.6 target (PRs #256–#258, runbooks). Historical reports must **not** be bulk-edited.
5. **Least disruptive rename candidate:** **2E.3 file** (later commit, later phase). Preserve 2D at `20260621120000` unless Agent A proves a safer alternative per environment.

**Do not assume** production or staging history matches repository intent. PR #258 documents production as NOT_APPLIED for both effects.

---

## Expected remediation model

Agent A remediation should normally satisfy:

| Requirement | Rationale |
| --- | --- |
| Preserve earlier 2D migration version `20260621120000` | First-introduced; referenced as earlier phase |
| Move 2E.3 migration to a **unique later version** | Removes collision; deterministic pending set |
| Preserve 2E.3 SQL behavior exactly | No functional regression in outbound RPC |
| Add idempotent later reconciliation for 2D identity metadata | Hedge for ambiguous non-production history |
| Avoid manual `schema_migrations` editing | Operator safety; auditability |
| Add duplicate-version regression test | Prevent recurrence |

### Alternative strategies

If Agent A renumbers 2D instead, or uses a combined migration, require **scenario-by-scenario proof** (see matrix below) that the approach is safer than rename-later-2E.3 + reconciliation.

---

## Scenario matrix

Independent expected outcomes after remediation **apply** (future approved window only):

| Scenario | Starting state | Expected post-apply state |
| --- | --- | --- |
| **A. Duplicate version never applied** | No `20260621120000` row; neither schema effect present | Both 2D columns/constraint **and** 2E.3 RPC param present |
| **B. 2D SQL applied under duplicate version** | Identity columns exist; RPC param absent | RPC param added; identity metadata unchanged |
| **C. 2E.3 SQL applied under duplicate version** | RPC param present; identity columns absent | Identity columns/constraint added idempotently; RPC unchanged |
| **D. Version recorded but effects missing** | History row exists; schema incomplete | Reconciliation + renamed migration restore missing effects without destructive DDL |
| **E. Both schema effects already present** | Full parity | Migrations no-op safely; history records new unique versions only |

### Acceptance end-state (all scenarios)

Final schema must contain **both**:

- **IG-AUTH-2D:** `verified_username`, `verified_account_type`, `identity_verified_at`, `instagram_oauth_credentials_verified_account_type_scope`
- **IG-AUTH-2E.3:** `create_outbound_message_with_outbox` with `p_instagram_credential_binding jsonb default null`

Without `DROP TABLE/COLUMN`, `TRUNCATE`, destructive DML, or credential backfill.

---

## SQL safety checklist

Reject remediation that includes:

| Prohibited | Notes |
| --- | --- |
| `DROP TABLE` / `DROP COLUMN` | Destructive |
| `TRUNCATE` | Destructive |
| Destructive `UPDATE` / `DELETE` | Data mutation |
| Credential data mutation | Out of scope |
| Mandatory backfill | Out of scope |
| Manual `schema_migrations` edits in SQL | Use migration files only |
| Unrelated function/schema changes | Scope creep |

### Required safety properties

| Check | 2D migration (current) | 2E.3 migration (current) |
| --- | --- | --- |
| `ADD COLUMN IF NOT EXISTS` | Yes | N/A |
| `DROP CONSTRAINT IF EXISTS` + re-add scoped CHECK | Yes (constraint only) | N/A |
| `CREATE OR REPLACE FUNCTION` (additive param) | N/A | Yes |
| `default null` on new RPC param | N/A | Yes — legacy caller compatible |

Reconciliation migration must use idempotent `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` patterns scoped to `instagram_oauth_credentials` only.

---

## Version ordering

Post-remediation acceptance gate:

| Rule | Requirement |
| --- | --- |
| All prefixes unique | **Zero** duplicate numeric prefixes |
| Renamed 2E.3 version | **>** `20260621120000` |
| Reconciliation version | **>** renamed 2E.3 version |
| No future collision | Scan entire `supabase/migrations/` |

Suggested independent scan (reviewers):

```powershell
Get-ChildItem supabase/migrations -Filter "*.sql" |
  ForEach-Object { $_.Name.Substring(0,14) } |
  Group-Object |
  Where-Object { $_.Count -gt 1 }
```

Expected after fix: **no output**.

---

## SQL equivalence criteria

When Agent A renames the 2E.3 file:

| Criterion | Requirement |
| --- | --- |
| Functional diff vs current `…_2e3_outbound_instagram_binding.sql` | **NONE** (comment-only diff acceptable) |
| Final parameter | `p_instagram_credential_binding jsonb default null` |
| Legacy callers | Compatible without binding argument |
| `schema.sql` parity | Updated to match renamed migration |

Compare via `git diff` or content hash between old and new filenames excluding the version prefix in the path.

---

## Reconciliation criteria

A later reconciliation migration should ensure 2D identity metadata exists:

```text
verified_username
verified_account_type
identity_verified_at
instagram_oauth_credentials_verified_account_type_scope (CHECK)
```

| Property | Requirement |
| --- | --- |
| Idempotent | Safe if objects already exist |
| Scoped | `instagram_oauth_credentials` only |
| Documentation | Must state hedge for **ambiguous non-production history**, not evidence that production was modified |
| Production boundary | Remediation PR does not execute against production |

---

## Regression-test criteria

Remediation PR should add a test that:

| Criterion | Requirement |
| --- | --- |
| Detects duplicate numeric prefixes | Fails when any prefix appears >1 time |
| Lists offending files | Deterministic sorted output |
| Platform | Works on Windows and CI |
| Dependencies | No database/network |
| Execution | Included in normal `npm test` / CI path |

**Current master:** no migration-uniqueness regression test found. Absence is a gap remediation must close.

---

## Historical evidence integrity

| Policy | Rule |
| --- | --- |
| Do not rewrite history | Prior agent reports and runbooks may keep citing `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| New docs | Must explain this was the **conflicting historical filename** and identify the **remediated filename** |
| Reject | Bulk search-replace across historical evidence packs |
| PR #258 / #259 | Remain valid as executed HOLD evidence |

---

## Production boundary

Confirmed from merged evidence (PR #258); not re-queried by Agent B:

| Item | State |
| --- | --- |
| Production migration | **NOT_APPLIED** |
| DB admin path during 2E.6 | **Unavailable** |
| Migration executed in 2E.6 window | **NO** |
| Environment / flag changes | **NONE** |
| Deployment | **SKIPPED_ALREADY_CURRENT** |
| Provider calls / messages | **NONE** |

Remediation work **only** makes a future `GO MIGRATION WINDOW` safe to schedule. It does not authorize execution.

---

## Agent A remediation PR review checklist

When Agent A PR is available, review in an isolated worktree at exact remote SHA:

| Item | Gate |
| --- | --- |
| Scope | Only intended migration/test/schema/doc files |
| Renamed 2E.3 filename | Unique version > `20260621120000` |
| 2D file version | Unchanged at `20260621120000` (unless alternative strategy proven) |
| SQL equivalence | 2E.3 behavior preserved |
| Reconciliation migration | Present, idempotent, documented as hedge |
| `schema.sql` | Parity with final migrations |
| Uniqueness test | Present; passes locally |
| Docs | New filename documented; history preserved |
| Production actions | None claimed or performed |

---

## Verdict rubric (for remediation PR review)

| Verdict | When |
| --- | --- |
| **PASS** | Zero duplicate versions; 2E.3 SQL preserved; idempotent 2D reconciliation; schema parity; uniqueness test passes; no destructive SQL; no production action |
| **PASS WITH NOTES** | PASS criteria met with minor doc/test notes |
| **CHANGES REQUESTED** | Missing reconciliation, version ordering error, schema drift, weak test |
| **BLOCKED** | Migration executed in this phase; manual history edit; destructive SQL; secret committed; required schema behavior lost |

### This audit deliverable

| Item | Status |
| --- | --- |
| Collision audit | **Complete** |
| Remediation PR reviewed | **Pending** — not published |
| Recommendation | **Ready to review Agent A remediation when published** |

---

## Completion report

```text
Branch: docs/ig-auth-2e-6d-migration-collision-review
Commit: (pending)
PR: (pending)
Base master SHA: b3b298009baa21d5c5938dbb7ab43b9fdcdc5eee
Files changed: 1 (this report)

Duplicate versions confirmed: YES — 20260621120000 (count 2)
Earlier migration: 20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql (#247)
Later migration: 20260621120000_ig_auth_2e3_outbound_instagram_binding.sql (#254)
Git-history conclusion: 2D first; rename-later-2E.3 is least disruptive default
Expected unique ordering: 2D @ 20260621120000 → renamed 2E.3 @ >20260621120000 → reconciliation @ later
Scenario matrix: A–E documented above
SQL safety criteria: documented above
Reconciliation criteria: documented above
Regression-test criteria: documented above; test absent on master today
Historical evidence policy: preserve prior citations; document remediated filename in new docs

Agent A PR reviewed: NOT AVAILABLE
Agent A reviewed SHA: N/A
Duplicate versions after fix: N/A (remediation pending)
2E.3 SQL equivalence: N/A (remediation pending)
Reconciliation safety: N/A (remediation pending)
Schema parity: N/A (remediation pending)
Test results: N/A

Blocking findings: NONE (audit phase)
Non-blocking notes: remediation PR not yet published
Recommendation: Publish Agent A remediation PR; re-run Agent B review against acceptance gates
Scope confirmation: IG-AUTH-2E.6D independent migration-collision audit and review only.
  No migration/source/schema implementation by Agent B. No production database access.
  No migration execution or migration-history edits. No environment or feature-flag changes.
  No deployment. No provider calls or outbound messages. No merge performed.
```

---

## Scope confirmation

IG-AUTH-2E.6D independent migration-collision audit and review only. No migration/source/schema implementation by Agent B. No production database access. No migration execution or migration-history edits. No environment or feature-flag changes. No deployment. No provider calls or outbound messages. No merge performed.
