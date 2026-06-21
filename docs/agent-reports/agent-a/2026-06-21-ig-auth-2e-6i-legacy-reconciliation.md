# IG-AUTH-2E.6I Legacy 20260430 Reconciliation

> **Agent:** A
> **Date:** 2026-06-21
> **Branch:** `fix/ig-auth-2e6-legacy-20260430-reconciliation`
> **Companion:** [`ig-auth-2e-6-legacy-20260430-reconciliation.md`](../../instagram/ig-auth-2e-6-legacy-20260430-reconciliation.md)

---

## Summary

Repository-only Option B engineering fix for legacy shared migration version `20260430`. Adds unique reconciliation migration `20260621150000_legacy_20260430_reconciliation.sql` while preserving both historical files byte-for-byte unchanged.

**Decision: READY_FOR_INDEPENDENT_REVIEW** (repository engineering complete; no production access)

---

## Background

PR #264 and PR #265 verified SmartKorp production already has both legacy effects live, but CLI cannot record two files under one version key. Option B adds a modern unique reconciliation point before `GO MIGRATION HISTORY RECONCILIATION`.

---

## Historical file integrity

| File | SHA256 (before/after) | Changed |
| --- | --- | --- |
| `20260430_add_conversation_ids_to_outbound_function.sql` | `dc051f15855f…` | **No** |
| `20260430_reclassify_invalid_facebook_dm_threads.sql` | `0782ae1a8e4f…` | **No** |

---

## New migration

| Field | Value |
| --- | --- |
| Version | `20260621150000` |
| Filename | `20260621150000_legacy_20260430_reconciliation.sql` |
| Position | After `20260621140000` |
| 14-digit uniqueness | **Verified** (scan zero duplicates) |

---

## Function reconciliation

- **Name:** `create_outbound_message_with_outbox`
- **Identity arguments:** 16 params incl. `p_conversation_ids jsonb`, `p_instagram_credential_binding jsonb default null`
- **Return type:** `table (message_id uuid)`
- **Security definer:** false (matches 2E.3)
- **Body source:** Current final from `20260621130000` (not April 20260430-only body)
- **Preserves:** `conversationIds` outbox field + optional `instagramCredentialBinding`

---

## Data reconciliation

Exact historical predicate from `20260430_reclassify_invalid_facebook_dm_threads.sql`. Naturally idempotent (`provider_thread_type = 'MESSENGER_DM'` guard). Safe when residual count = 0.

---

## Production boundary

```text
Production access: NONE
Migration execution: NONE
Migration repair: NONE
Remote history edits: NONE
Production DB writes: NONE
Deployment: NONE
Provider calls: NONE
Outbound messages: NONE
```

---

## Next approval gate

1. Independent review of this PR
2. Merge to master
3. Operator **`GO MIGRATION HISTORY RECONCILIATION`** (separate from migration window)

---

## Completion report

See companion doc and PR description.
