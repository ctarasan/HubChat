# IG-AUTH-2E.6 Legacy 20260430 Reconciliation

Repository-only Option B implementation (IG-AUTH-2E.6I). **Does not access or mutate production.**

**Related:** [Agent A report](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6i-legacy-reconciliation.md) · [PR #264 migration history audit](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6g-migration-history-audit.md) · [PR #265 independent review](../agent-reports/agent-b/2026-06-21-ig-auth-2e-6h-migration-history-review.md)

---

## Background

Two local migrations share version prefix **`20260430`**:

```text
20260430_add_conversation_ids_to_outbound_function.sql
20260430_reclassify_invalid_facebook_dm_threads.sql
```

SmartKorp production audit (PR #264/#265) confirmed both effects are already live, but Supabase CLI cannot represent two separate remote history records under one version key.

---

## Verified production evidence

| Effect | Production state |
| --- | --- |
| Outbound RPC with `p_conversation_ids` | **PRESENT_EQUIVALENT** (15-arg pre-binding) |
| Facebook DM reclassification | **DATA_STATE_CONFIRMED** (residual count 0) |
| Shared `20260430` CLI history | **Cannot safely record both files** |

---

## Historical duplicate files

Both files are **preserved unchanged** (byte-for-byte). Hashes recorded in tests and Agent A report.

---

## Option B design

```text
- preserve both historical 20260430 files unchanged
- add one new unique 14-digit reconciliation migration
- idempotently ensure both legacy effects
- avoid broad or destructive data mutation
- create a safe reconciliation point for future migration-history repair
```

---

## New migration version

| Field | Value |
| --- | --- |
| Version | `20260621150000` |
| File | `20260621150000_legacy_20260430_reconciliation.sql` |
| Ordering | After `20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |

---

## Function reconciliation

Uses **`CREATE OR REPLACE FUNCTION`** with the **current final** outbound RPC body from `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql`:

- Ensures April **`conversationIds`** outbox behavior (`p_conversation_ids`)
- Preserves **`p_instagram_credential_binding`** from 2E.3 (does not regress to April-only 15-arg historical body)
- No queue semantic change beyond existing repository contract
- Legacy callers remain compatible (`binding` defaults `null`)

---

## Function evolution safety

Compared against:

- Historical `20260430` function migration
- Later `20260621130000` binding migration
- `supabase/schema.sql` final function definition

Reconciliation body **matches 2E.3** exactly — not the obsolete April-only function.

---

## Data reconciliation predicate

Exact historical `UPDATE` from `20260430_reclassify_invalid_facebook_dm_threads.sql`:

```sql
where provider_thread_type = 'MESSENGER_DM'
  and channel_type = 'FACEBOOK'
  and provider_external_user_id is not null
  and (
    channel_thread_id is null
    or channel_thread_id not like 'user:%'
  )
```

No broad unconditional update. No DELETE. Safe when zero rows match.

---

## Idempotency

| Part | Mechanism |
| --- | --- |
| Function | `CREATE OR REPLACE` — safe to re-run |
| Data | Predicate requires `MESSENGER_DM` — rows already reclassified are skipped |

---

## Reconciliation semantics

```text
The new migration is not evidence that the two 20260430 files were
independently recorded in remote migration history.

It is a unique modern reconciliation point that safely ensures both
historical effects before migration-history repair.
```

Does **not** modify `supabase_migrations.schema_migrations`.

---

## Historical file integrity

Verified by SHA256 in automated tests before/after implementation.

---

## Test coverage

Extended `src/lib/supabaseMigrationVersionUniqueness.test.ts`:

- Historical file hashes unchanged
- New version unique and after `20260621140000`
- Function body matches 2E.3 final signature
- Data predicate matches historical migration
- No DELETE/TRUNCATE/DROP TABLE
- Structural idempotency checks

---

## Production boundary

```text
Production migration executed: NONE
Migration repair executed: NONE
Remote history edits: NONE
Production DB writes: NONE
Deployment: NONE
Provider calls: NONE
Outbound messages: NONE
```

---

## Future migration-history repair sequence

After merge:

1. **`GO MIGRATION HISTORY RECONCILIATION`** — repair Group A (21 verified versions)
2. Mark or repair including unique `20260621150000` as reconciliation anchor
3. `migration list` + `db push --dry-run` — expect pending = 4 execution migrations (+ this file if not repaired)
4. Separate **`GO MIGRATION WINDOW`** for Group B execution only

---

## Next approval gate

Independent review → merge → operator `GO MIGRATION HISTORY RECONCILIATION`

---

## Scope confirmation

```text
IG-AUTH-2E.6I repository-only legacy reconciliation implementation.
No production database access. No migration execution.
No migration repair or remote history edits. No production DB writes.
No queue, environment, or feature-flag changes. No deployment.
No provider calls or outbound messages.
```
