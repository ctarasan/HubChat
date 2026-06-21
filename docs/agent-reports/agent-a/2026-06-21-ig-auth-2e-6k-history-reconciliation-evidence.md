# IG-AUTH-2E.6K Production Migration History Reconciliation Evidence

> **Agent:** A
> **Date:** 2026-06-21
> **Branch:** `docs/ig-auth-2e-6k-history-reconciliation-evidence`
> **Base master SHA:** `ceeac6e8375b10a483a4c8b8de18579c5540b0db`
> **Authorization:** `GO MIGRATION HISTORY RECONCILIATION`
> **Companion:** [`ig-auth-2e-6-history-reconciliation-evidence.md`](../../instagram/ig-auth-2e-6-history-reconciliation-evidence.md)

---

## Summary

Authorized controlled migration-history reconciliation attempted against SmartKorp production. Pre-repair gates passed (correct target, queue safety). **`supabase migration repair` failed** on database authentication before any history records were inserted.

**Decision: HOLD**

No migration history change occurred. No pending migrations executed.

---

## Approval

| Field | Value |
| --- | --- |
| Operator phrase | `GO MIGRATION HISTORY RECONCILIATION` |
| Authorized | Mark 20 verified unique versions applied; post-repair list + dry-run only |
| Not authorized | Pending migration execution, `db push` without `--dry-run`, manual `schema_migrations` SQL, flag/deploy changes |

---

## Correct production target

| Field | Value |
| --- | --- |
| Project name | SmartKorp Hub Chat |
| Ref (masked) | `dsky…hyx` |
| Verified via | `supabase/.temp/linked-project.json` + prior 2E.6G audit |
| Target correct | **YES** |

---

## Pre-repair migration list

Executed `supabase migration list --linked` (2026-06-21):

| Check | Result |
| --- | --- |
| Local migrations | 26 files (21 historical + 5 pending) |
| Remote history | **Blank** for all versions |
| Shared `20260430` local rows | 2 files, 1 version key |

---

## Queue and flag gates

Read-only queue probes via `supabase db query --linked`:

| Metric | Count |
| --- | ---: |
| Outbound PENDING | 0 |
| Outbound PROCESSING | 0 |
| Stale PROCESSING (>15 min) | 0 |
| OAuth-bound PENDING/PROCESSING | 0 |

Instagram OAuth delivery flags (Vercel + Railway): **ABSENT** per merged 2E.5A/2E.6G evidence; **not re-changed** this window.

Queue/flag gate: **PASS**

---

## Exact authorized repair versions

20 unique versions (21 files; `20260430` once):

```text
20260430, 20260506, 20260509000100, 20260512120000, 20260512180000,
20260513120000, 20260514120000, 20260519120000, 20260520120000,
20260526120000, 20260527120000, 20260530120000, 20260531120000,
20260601120000, 20260602120000, 20260602154000, 20260604120000,
20260608120000, 20260614120000, 20260619120000
```

Excluded from repair (must remain pending):

```text
20260620120000, 20260621120000, 20260621130000, 20260621140000, 20260621150000
```

List matches merged PR #264 / PR #265 audit: **YES**

---

## Repair command result

Command attempted (single invocation, 20 versions, `--status applied --linked`):

```text
supabase migration repair <20 authorized versions> --status applied --linked
```

| Field | Result |
| --- | --- |
| Exit code | **1** |
| Sanitized error class | `password authentication failed` for CLI login role |
| History records inserted | **0** |
| Retry / manual SQL / alternative repair | **None** (per stop rules) |

Post-failure `migration list --linked`: remote column **still blank** for all versions.

---

## Post-repair migration list

**Not applicable** — repair did not succeed. State unchanged from pre-repair.

---

## Post-repair dry-run

**Not executed** — repair failed; dry-run requires successful repair first.

Expected target after successful repair: **EXACT_FIVE_PENDING**

---

## Exact five pending migrations (target end state)

After successful future repair, dry-run must list only:

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
20260621150000_legacy_20260430_reconciliation.sql
```

---

## Mutation attestation

| Check | Result |
| --- | --- |
| Migration history changed | **NO** |
| Application schema changed | **NO** |
| Application data changed | **NO** |
| Pending migrations executed | **NONE** |
| Queue mutations | **NONE** |
| Flags changed | **NONE** |
| Deployments | **NONE** |
| Provider calls | **NONE** |
| Outbound messages | **NONE** |

---

## Security sanitization

- No database passwords, connection URLs, service keys, or tokens committed
- Project ref masked (`dsky…hyx`)
- CLI error sanitized (no credential values recorded)
- No customer data or message content queried

---

## Decision

**HOLD**

Blocking finding: **`supabase migration repair` authentication failure** — CLI could not complete authorized history repair.

---

## Next approval required

1. Operator restores Supabase CLI database password / login session for linked SmartKorp production
2. Re-issue **`GO MIGRATION HISTORY RECONCILIATION`** (or operator-confirmed retry window)
3. Re-run repair → post-repair list → dry-run → evidence update
4. Separate **`GO MIGRATION WINDOW`** only after **EXACT_FIVE_PENDING** dry-run

---

## Completion report

```text
Branch: docs/ig-auth-2e-6k-history-reconciliation-evidence
Commit: ed2359c
PR: #268
Base master SHA: ceeac6e8375b10a483a4c8b8de18579c5540b0db

Correct production target: YES (SmartKorp Hub Chat, dsky…hyx)
Pre-repair remote history: blank for all versions
Queue gates: PASS (0/0/0/0 OAuth-bound)
OAuth flag states: ABSENT (prior audit; unchanged)

Authorized files represented: 21
Authorized unique versions: 20
Repair command executed: YES (attempted)
Repair result: FAILED (auth)
History records inserted: 0

Post-repair migration list: unchanged (blank remote)
Unexpected remote versions: none
Pending versions: all 26 still effectively pending in remote history

Post-repair dry-run: NOT RUN
Dry-run classification: N/A
Exact pending filenames: N/A (repair blocked)

Application schema changes: NONE
Application data changes: NONE
Pending migrations executed: NONE
Queue mutations: NONE
Environment changes: NONE
Deployments: NONE
Provider calls: NONE
Outbound messages: NONE

Blocking findings: CLI_DB_AUTH_FAILURE_ON_MIGRATION_REPAIR
Decision: HOLD
Next approval required: restore CLI DB auth + retry GO MIGRATION HISTORY RECONCILIATION

Scope confirmation:
IG-AUTH-2E.6K controlled migration-history reconciliation only.
Repair attempted but no history change applied.
No pending migration execution.
No application-schema or application-data changes.
No queue, environment, deployment, provider, or outbound activity.
No merge performed.
```
