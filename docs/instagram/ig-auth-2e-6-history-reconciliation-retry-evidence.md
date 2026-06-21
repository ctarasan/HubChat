# IG-AUTH-2E.6M Migration History Reconciliation Retry Evidence

Sanitized evidence from authorized `GO MIGRATION HISTORY RECONCILIATION` retry after CLI authentication restoration.

**Related:** [Agent A report](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6m-history-reconciliation-retry.md) · PR #268 (2E.6K HOLD) · PR #269 (2E.6L review)

---

## Approval

| Authorization | Scope |
| --- | --- |
| `GO MIGRATION HISTORY RECONCILIATION` | Repair 20 verified unique versions; list + dry-run only |
| **Not authorized** | Execute pending migrations, `db push` without `--dry-run`, flags/deploy |

---

## Base master SHA

`eeb90eaf4453238175bd246f1f10d7dc10b0db` (PR #268 + #269 merged)

---

## Correct production target

| Item | Value |
| --- | --- |
| Project | SmartKorp production |
| Ref (masked) | `dsky…hyx` |
| CLI auth | **Working** |
| Pre-repair remote | **Blank / unchanged from prior audits** |

---

## CLI version

`2.98.2` (not upgraded during window)

---

## Pre-repair state

```text
supabase migration list --linked
Remote column: blank for all local versions
```

---

## Queue and flag gates

| Gate | Result |
| --- | --- |
| Outbound PENDING / PROCESSING / stale | **0 / 0 / 0** |
| OAuth-bound PENDING / PROCESSING | **0 / 0** |
| Malformed bindings | **0** |
| OAuth delivery flags (Vercel/Railway) | **ABSENT** |

---

## Authorized repair set

**20 unique versions** marked `--status applied` (see Agent A report).

**Protected pending (not repaired):**

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
| Exit code | **0** |
| History records inserted | **20** (read-only verified) |
| Protected versions applied | **None** |

---

## Post-repair migration list

| Check | Result |
| --- | --- |
| Remote unique applied | **20 authorized versions** |
| Local duplicate `20260430` display | One remote row; second local row blank remote (expected) |
| Five protected versions | Remote **blank** |

---

## Post-repair dry-run

| Field | Value |
| --- | --- |
| Command | `supabase db push --linked --dry-run` |
| SQL executed | **None** |
| Classification | **MISSING_EXPECTED_MIGRATION** |
| Expected EXACT_FIVE_PENDING | **No** |

CLI reported legacy ordering conflict for `20260430_reclassify_invalid_facebook_dm_threads.sql` instead of listing five pending IG migrations.

---

## Target pending filenames (not dry-run confirmed)

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
20260621150000_legacy_20260430_reconciliation.sql
```

---

## Mutation attestation

```text
Migration-history records inserted: 20 unique versions only
Pending migrations executed: NONE
Application schema changed: NO
Application data changed: NO
```

---

## Decision

**HOLD** — history repair succeeded; dry-run gate failed.

---

## Next approval

```text
1. Independent Agent B review of 2E.6M evidence
2. Resolve legacy 20260430 dry-run collision before GO MIGRATION WINDOW
3. Fresh operator approval for any migration execution
```

---

## Scope confirmation

```text
IG-AUTH-2E.6M controlled migration-history reconciliation retry only.
20 history records inserted. Five protected versions remain pending.
No pending migration SQL executed.
No application schema/data changes.
No merge performed.
```
