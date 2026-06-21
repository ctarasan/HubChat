# IG-AUTH-2E.6K Migration History Reconciliation Evidence

Sanitized evidence from authorized `GO MIGRATION HISTORY RECONCILIATION` execution attempt. **No migration history change applied.**

**Related:** [Agent A report](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6k-history-reconciliation-evidence.md) · PR #264 audit · PR #267 reconciliation · PR #266 review

---

## Approval

| Authorization | Scope |
| --- | --- |
| `GO MIGRATION HISTORY RECONCILIATION` | Repair 20 verified unique versions; list + dry-run only |
| **Not authorized** | Execute pending migrations, `db push`, manual history SQL, flags/deploy |

---

## Correct production target

| Item | Value |
| --- | --- |
| Project | SmartKorp production |
| Ref (masked) | `dsky…hyx` |
| Verified | **YES** |

---

## Pre-repair state

```text
supabase migration list --linked
Remote column: blank for all 26 local versions
```

Historical count correction:

```text
21 historical migration files
20 unique historical versions (20260430 shared by two files)
```

---

## Queue and flag gates

| Gate | Result |
| --- | --- |
| Outbound PENDING / PROCESSING / stale | **0 / 0 / 0** |
| OAuth-bound active jobs | **0** |
| OAuth delivery flags (Vercel/Railway) | **ABSENT** (unchanged) |

---

## Authorized repair set

**20 unique versions** marked for `--status applied` (see Agent A report for full list).

**Must remain pending:**

```text
20260620120000
20260621120000
20260621130000
20260621140000
20260621150000
```

---

## Repair outcome

| Field | Value |
| --- | --- |
| Command | `supabase migration repair` (20 versions, `--status applied --linked`) |
| Result | **FAILED** — CLI database authentication error |
| History records inserted | **0** |
| Remote history after attempt | **Unchanged** (still blank) |

No manual SQL, no retry with `--status reverted`, no alternative bootstrap attempted.

---

## Post-repair verification

| Step | Status |
| --- | --- |
| `migration list --linked` | Remote still blank — confirms no repair applied |
| `db push --dry-run` | **Not run** (blocked on failed repair) |

---

## Target end state (after successful future repair)

Dry-run must classify **EXACT_FIVE_PENDING** with exactly:

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
20260621150000_legacy_20260430_reconciliation.sql
```

---

## Mutation attestation

Only authorized mutation would be 20 applied-version history records. **None inserted.**

```text
Migration history changed: NO
Application schema changed: NO
Application data changed: NO
Pending migrations executed: NONE
```

---

## Decision

**HOLD**

Operator must restore Supabase CLI database authentication for linked SmartKorp production before retry.

---

## Next approval

```text
1. Fix CLI DB password / login for SmartKorp linked project
2. Re-run GO MIGRATION HISTORY RECONCILIATION
3. Require EXACT_FIVE_PENDING dry-run before GO MIGRATION WINDOW
```

---

## Scope confirmation

```text
IG-AUTH-2E.6K controlled migration-history reconciliation only.
Repair attempted; no history change applied.
No pending migration execution.
No application-schema or application-data changes.
No queue, environment, deployment, provider, or outbound activity.
No merge performed.
```
