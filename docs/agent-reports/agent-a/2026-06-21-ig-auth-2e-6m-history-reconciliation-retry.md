# IG-AUTH-2E.6M Production Migration History Reconciliation Retry

> **Agent:** A
> **Date:** 2026-06-21
> **Branch:** `docs/ig-auth-2e-6m-history-reconciliation-retry`
> **Base master SHA:** `eeb90eaf4453238175bd246f1f10d7dc10b20a1f`
> **Authorization:** `GO MIGRATION HISTORY RECONCILIATION`
> **Companion:** [`ig-auth-2e-6-history-reconciliation-retry-evidence.md`](../../instagram/ig-auth-2e-6-history-reconciliation-retry-evidence.md)

---

## Summary

Authorized migration-history repair **succeeded** — exactly **20 unique versions** inserted into `supabase_migrations.schema_migrations`. Post-repair `migration list --linked` confirms five protected versions remain pending. **Dry-run gate failed:** `db push --linked --dry-run` did not classify **EXACT_FIVE_PENDING** (legacy `20260430` duplicate-version CLI ordering conflict).

**Decision: HOLD**

No pending migration SQL executed. No application schema or data changes.

---

## Approval

| Field | Value |
| --- | --- |
| Operator phrase | `GO MIGRATION HISTORY RECONCILIATION` |
| Prior attempts | PR #268 (2E.6K auth failure); PR #269 (2E.6L review) |
| Operator pre-window | CLI auth restored; read-only `migration list` confirmed blank remote |

---

## Base master SHA

`eeb90eaf4453238175bd246f1f10d7dc10b20a1f` — includes merged PR #268 and PR #269.

---

## Correct production target

| Field | Value |
| --- | --- |
| Project name | SmartKorp Hub Chat |
| Ref (masked) | `dsky…hyx` |
| Linked target verified | **YES** |
| Pre-repair remote history | **Blank** for all versions |
| Post-repair target | **Correct** |

---

## CLI version

| Field | Value |
| --- | --- |
| Installed | `2.98.2` |
| Upgrade during window | **No** (newer v2.107.0 available; not applied) |

---

## Pre-repair migration list

`supabase migration list --linked` before repair:

| Check | Result |
| --- | --- |
| Connection | **Success** |
| Remote column | **Blank** for all 26 local rows |
| Local rows | 26 (21 historical files + 5 pending; two `20260430` files share one version) |

---

## Queue and OAuth flag gates

Read-only `supabase db query --linked` (pre-repair):

| Metric | Count |
| --- | ---: |
| Outbound PENDING | 0 |
| Outbound PROCESSING | 0 |
| Stale PROCESSING (>15 min) | 0 |
| OAuth-bound PENDING | 0 |
| OAuth-bound PROCESSING | 0 |
| Malformed bindings | 0 |

| Flag check | Result |
| --- | --- |
| Vercel Instagram OAuth delivery flags | **ABSENT** (no matching env names in production listing) |
| Railway Instagram OAuth delivery flags | **ABSENT** (per merged 2E.5A evidence; not changed this window) |

Queue/flag gate: **PASS**

---

## Exact authorized repair versions

20 unique versions (matches PR #264 / PR #265 audit):

```text
20260430, 20260506, 20260509000100, 20260512120000, 20260512180000,
20260513120000, 20260514120000, 20260519120000, 20260520120000,
20260526120000, 20260527120000, 20260530120000, 20260531120000,
20260601120000, 20260602120000, 20260602154000, 20260604120000,
20260608120000, 20260614120000, 20260619120000
```

Excluded (protected pending):

```text
20260620120000, 20260621120000, 20260621130000, 20260621140000, 20260621150000
```

---

## Repair command result

Single invocation: `supabase migration repair` (20 versions, `--status applied --linked`).

| Field | Result |
| --- | --- |
| Exit code | **0** |
| CLI response | `Finished supabase migration repair` — 20 versions => applied |
| Retry after success | **None** |

Read-only confirmation (`schema_migrations`):

| Field | Result |
| --- | --- |
| Row count | **20** |
| Protected versions in table | **None** |

**History mutation classification:** `FULL_SUCCESS` (exactly 20 authorized unique versions)

---

## Post-repair migration list

`supabase migration list --linked` after repair:

| Check | Result |
| --- | --- |
| Remote applied unique set | **20 authorized versions** |
| Second local `20260430` row | Remote blank (expected — one version key) |
| Protected five | Remote **blank** |
| Unexpected remote-only version | **None** |

---

## Remote unique applied-version set

```text
20260430, 20260506, 20260509000100, 20260512120000, 20260512180000,
20260513120000, 20260514120000, 20260519120000, 20260520120000,
20260526120000, 20260527120000, 20260530120000, 20260531120000,
20260601120000, 20260602120000, 20260602154000, 20260604120000,
20260608120000, 20260614120000, 20260619120000
```

Count: **20**

---

## Protected pending versions

Remote history **not** applied:

```text
20260620120000
20260621120000
20260621130000
20260621140000
20260621150000
```

Schema probe confirms pending objects still absent (`instagram_oauth_states` table count 0; identity column count 0).

---

## Post-repair dry-run

`supabase db push --linked --dry-run`:

| Field | Result |
| --- | --- |
| Exit code | **1** |
| `--dry-run` honored | **Yes** (no SQL executed) |
| Output class | **MISSING_EXPECTED_MIGRATION** |

Sanitized CLI message (not EXACT_FIVE_PENDING):

```text
Found local migration files to be inserted before the last migration on remote database.
Rerun with --include-all to apply:
20260430_reclassify_invalid_facebook_dm_threads.sql
```

Expected five files **not listed** in dry-run output.

**Dry-run classification:** `MISSING_EXPECTED_MIGRATION` (legacy duplicate `20260430` CLI ordering conflict)

---

## Exact pending filenames

Target end state (not confirmed by dry-run):

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
| Migration-history records inserted | **20 unique versions only** |
| Pending migrations executed | **NONE** |
| Application schema changed | **NO** |
| Application data changed | **NO** |
| Queue mutations | **NONE** |
| Environment / flag changes | **NONE** |
| Deployments / restarts | **NONE** |
| Provider calls | **NONE** |
| Outbound messages | **NONE** |

---

## Security sanitization

- No passwords, tokens, database URLs, or service keys in evidence
- Project ref masked (`dsky…hyx`)
- Queue probes used aggregate counts only
- No customer data or message content queried

---

## Decision

**HOLD**

History repair succeeded, but dry-run did not achieve **EXACT_FIVE_PENDING**. Do not request **`GO MIGRATION WINDOW`** until dry-run gate is independently reviewed and resolved.

---

## Next approval required

1. Maintainer merge this evidence PR
2. **Independent reconciliation review** (Agent B) of repair + dry-run outcome
3. Engineering review of legacy `20260430` dry-run collision vs PR #267 reconciliation migration plan
4. Fresh operator approval before any migration execution window

---

## Completion report

```text
Result: HOLD (repair success; dry-run gate fail)
Branch: docs/ig-auth-2e-6m-history-reconciliation-retry
Commit: 3eb6b87
PR: #270
Base master SHA: eeb90eaf4453238175bd246f1f10d7dc10b0db

Correct production target: YES (SmartKorp Hub Chat, dsky…hyx)
CLI version: 2.98.2
Pre-repair remote history: blank for all versions
Queue gates: PASS (0/0/0/0/0/0)
OAuth flag states: ABSENT (Vercel listing; Railway prior audit)

Authorized unique versions: 20
Repair command exit: 0
Repair response: Finished — 20 versions => applied
History mutation classification: FULL_SUCCESS

Post-repair remote unique versions: 20 authorized
Unexpected remote versions: none
Protected pending versions: 5 (remote blank)

Dry-run classification: MISSING_EXPECTED_MIGRATION
Dry-run pending count: not five (CLI lists 20260430_reclassify only)
Exact pending filenames: not confirmed by dry-run

Pending migrations executed: NONE
Application schema changes: NONE
Application data changes: NONE
Queue mutations: NONE
Environment/flag changes: NONE
Deployments/restarts: NONE
Provider calls: NONE
Outbound messages: NONE

Blocking findings: DRY_RUN_NOT_EXACT_FIVE_PENDING
Non-blocking notes: CLI auth circuit-breaker briefly after rapid post-repair calls; recovered for migration list retry
Decision: HOLD
Next approval required: independent review + dry-run collision resolution before GO MIGRATION WINDOW
Scope confirmation:
IG-AUTH-2E.6M controlled migration-history reconciliation retry only.
20 history records inserted. No pending migration execution.
No application schema/data changes. No merge performed.
```

---

## Scope confirmation

```text
IG-AUTH-2E.6M controlled migration-history reconciliation retry only.
Operator approval: GO MIGRATION HISTORY RECONCILIATION.
Exactly 20 audited unique historical versions authorized for applied repair.
Five protected versions remain pending in remote history.
No pending migration execution.
No application schema/data changes.
No queue, environment, deployment, provider, or outbound activity.
No merge performed.
```
