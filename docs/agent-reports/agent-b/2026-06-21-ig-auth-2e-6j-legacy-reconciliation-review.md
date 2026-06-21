# IG-AUTH-2E.6J Independent Review — Legacy `20260430` Reconciliation

> **Agent:** B
> **Date:** 2026-06-21
> **Branch:** `docs/ig-auth-2e-6j-legacy-reconciliation-review`
> **Agent B PR:** [#266](https://github.com/ctarasan/HubChat/pull/266)
> **Subject:** [Agent A PR #267](https://github.com/ctarasan/HubChat/pull/267) (IG-AUTH-2E.6I)
> **Review worktree:** `D:\Project\AI CODING\HUB Chat-agent-b-pr267` @ detached `1a1ac07`
> **Base master SHA:** `e224522fd9fc5d18225d4337cea51a92d7d5b3aa`

---

## Verdict

**PASS — READY TO MERGE RECONCILIATION IMPLEMENTATION**

This review does **not** authorize migration-history repair or migration execution.

---

## Review target

| Field | Value |
| --- | --- |
| Agent A PR | [#267](https://github.com/ctarasan/HubChat/pull/267) |
| Head branch | `fix/ig-auth-2e6-legacy-20260430-reconciliation` |
| Reviewed SHA | `1a1ac071c29844f85ff031238d81b12858b4492d` |
| Expected SHA | **Match** |
| Prior HOLD | PR #266 skeleton superseded by this report |

Agent B did **not** modify Agent A repository or PR #267 branch.

---

## Scope gate

Reviewed `git diff origin/master...HEAD` at `1a1ac07`:

| File | In PR |
| --- | --- |
| `supabase/migrations/20260621150000_legacy_20260430_reconciliation.sql` | Yes |
| `src/lib/supabaseMigrationVersionUniqueness.test.ts` | Yes |
| `docs/agent-reports/agent-a/2026-06-21-ig-auth-2e-6i-legacy-reconciliation.md` | Yes |
| `docs/instagram/ig-auth-2e-6-legacy-20260430-reconciliation.md` | Yes |

| Check | Result |
| --- | --- |
| File count | **4** (exact expected set) |
| Runtime / worker / channel / env changes | **None** |
| `facebookAdapter.test.ts` | **Excluded** (not in PR) |
| `schema.sql` | **Unchanged** (final RPC parity already on master) |
| `git diff --check` | **Clean** |
| Verdict | **PASS** |

---

## Historical file integrity

```powershell
git diff --exit-code origin/master -- `
  supabase/migrations/20260430_add_conversation_ids_to_outbound_function.sql `
  supabase/migrations/20260430_reclassify_invalid_facebook_dm_threads.sql
```

| Result | Value |
| --- | --- |
| Exit code | **0** |
| Output | **None** |

Tests additionally pin SHA256 hashes for both historical files. **No rename or modification.**

---

## Migration version review

| Check | Result |
| --- | --- |
| New file | `20260621150000_legacy_20260430_reconciliation.sql` |
| 14-digit version | **Yes** (`20260621150000`) |
| After `20260621140000` | **Yes** (ordering test confirms) |
| 14-digit duplicate scan | **Zero duplicates** |
| Historical `20260430` short pair | **Preserved** (unchanged) |

---

## Function reconciliation review

Compared:

- `20260430_add_conversation_ids_to_outbound_function.sql` (historical April body — 15-arg, no binding)
- `20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` (current final)
- `20260621150000_legacy_20260430_reconciliation.sql` (reconciliation)
- `supabase/schema.sql` (final RPC on master)
- `src/infrastructure/adapters/repositories/supabaseOutboundCommandRepository.ts` (always passes `p_instagram_credential_binding`)

| Attribute | Reconciliation migration | Agent B |
| --- | --- | --- |
| Function name | `create_outbound_message_with_outbox` | **Match** |
| Identity arguments | 16 params incl. `p_conversation_ids jsonb`, `p_instagram_credential_binding jsonb default null` | **Match 2E.3 / schema.sql** |
| Return type | `table (message_id uuid)` | **Match** |
| SECURITY DEFINER | Not set (plain `language plpgsql`) | **Match 2E.3** |
| `search_path` | Not altered | **Match** |
| `conversationIds` in outbox payload | Yes (`coalesce(p_conversation_ids, '[]'::jsonb)`) | **Preserves April effect** |
| `instagramCredentialBinding` | Conditional merge when non-null | **Preserves 2E.3 effect** |
| DOCUMENT_PDF / IMAGE handling | Full final body | **Not regressed vs 2E.3** |
| Normalized body equivalence test | `normalizeSqlForEquivalence(extractCreateOrReplaceFunction(...))` equal to 2E.3 | **PASS** |

**Classification:** **FUNCTION_RECONCILIATION_SAFE**

Reconciliation targets **current final shape**, not obsolete April-only body.

---

## Data reconciliation review

Compared UPDATE predicate in reconciliation migration vs `20260430_reclassify_invalid_facebook_dm_threads.sql`:

| Check | Result |
| --- | --- |
| Predicate match (normalized SQL test) | **Exact match** |
| Narrow scope | `MESSENGER_DM` + `FACEBOOK` + `provider_external_user_id` + invalid `channel_thread_id` |
| Broad unconditional update | **None** |
| DELETE / TRUNCATE | **None** (also asserted in tests) |
| Idempotent | Yes — sets `FACEBOOK_COMMENT`; already-reclassified rows excluded by `MESSENGER_DM` guard |
| Safe at zero rows | **Yes** |
| Customer content in evidence | **None** |

**Classification:** **DATA_RECONCILIATION_SAFE**

---

## Option B semantics

| Requirement | PR #267 |
| --- | --- |
| Both historical files preserved | **Yes** |
| One unique modern reconciliation point | **Yes** (`20260621150000`) |
| Does not claim separate remote history for both `20260430` files | **Yes** (comment + docs explicit) |
| Does not edit `schema_migrations` | **Yes** |
| Does not run migration repair | **Yes** (repository only) |
| No production access | **Yes** (attested) |

### Future pending-set treatment

After history repair of 21 verified versions, dry-run **must** show **5** pending migrations for execution (not 4):

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
20260621150000_legacy_20260430_reconciliation.sql
```

**Critical operator note:** Do **not** mark `20260621150000` applied during `GO MIGRATION HISTORY RECONCILIATION` — production still lacks `p_instagram_credential_binding` (PR #264 audit). Function upgrade requires real execution in `GO MIGRATION WINDOW`.

Agent A doc phrase “4 execution migrations (+ this file if not repaired)” is **conditionally correct** but step 2 wording “Mark or repair including unique `20260621150000`” could mislead. **Non-blocking:** clarify at merge that reconciliation migration stays **pending for execution**.

Approval phases remain separated:

1. `GO MIGRATION HISTORY RECONCILIATION` — repair only; no pending execution
2. `migration list` + `db push --dry-run` — verify 5 pending
3. `GO MIGRATION WINDOW` — execute reviewed pending set only

---

## Test review

Independent run at `1a1ac07` in review worktree (`npm ci` + full suite):

| Command | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **2264 pass / 0 fail** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |

Targeted migration tests in `supabaseMigrationVersionUniqueness.test.ts`:

- Historical file hashes unchanged
- Version unique and ordered after `20260621140000`
- Function body equivalent to 2E.3 final
- Data predicate matches historical migration
- No DELETE/TRUNCATE/DROP TABLE
- Structural idempotency guards

---

## Security and mutation boundary

PR #267 diff scanned — no secrets, full project refs, customer data, or raw payloads.

| Boundary | Agent B / PR #267 |
| --- | --- |
| Production access | **NONE** |
| Migration execution | **NONE** |
| Migration repair | **NONE** |
| Remote history edits | **NONE** |
| DB writes | **NONE** |
| Environment changes | **NONE** |
| Deployments | **NONE** |
| Provider calls | **NONE** |
| Outbound messages | **NONE** |

**Security scan:** **PASS**

---

## Blocking findings

**None.**

---

## Non-blocking notes

1. Agent A companion doc should emphasize **5-file** post-repair pending set explicitly to avoid marking `20260621150000` applied during history repair.
2. Executing `20260621150000` after `20260621130000` is functionally redundant for RPC shape (both apply final 16-arg body); operator should follow master order and treat both as independently reviewed pending files until execution window planning refines ordering.

---

## Required amendments

**None** for merge approval.

---

## Recommendation

**Approve PR #267 for maintainer merge.**

---

## GitHub comment

Posted to PR #267.

---

## Completion report

```text
Review result: PASS — READY TO MERGE RECONCILIATION IMPLEMENTATION
Agent A PR: #267
Reviewed SHA: 1a1ac071c29844f85ff031238d81b12858b4492d
Agent B PR: #266
Agent B commit: (this update)

Scope gate: PASS (4 files only)
Historical files unchanged: YES (exit 0 + hash tests)
New migration: 20260621150000_legacy_20260430_reconciliation.sql
Version uniqueness: PASS (14-digit, after 20260621140000)

Function classification: FUNCTION_RECONCILIATION_SAFE
Identity arguments: 16-param final (matches 2E.3)
Return type: table(message_id uuid)
Security-definer state: false (matches 2E.3)
Final behavior preserved: YES (normalized equivalence test)
Instagram binding preserved: YES
Legacy compatibility: YES (conversationIds + optional binding)

Data classification: DATA_RECONCILIATION_SAFE
Predicate accuracy: exact match to historical migration
Idempotency: YES
Destructive SQL check: PASS (no DELETE/TRUNCATE/DROP TABLE)

Option B semantics: CORRECT
Expected future pending set: 5 files (includes 20260621150000)
History-repair separation: PASS (repair vs window separated)

Targeted tests: PASS (supabaseMigrationVersionUniqueness.test.ts)
Full suite: 2264 pass
Typecheck: PASS
Lint: PASS
Build: PASS
git diff --check: PASS
Security scan: PASS
Mutation check: NONE

Blocking findings: none
Non-blocking notes: clarify 5-file pending set in operator docs
Required amendments: none
Recommendation: Approve PR #267 for maintainer merge
GitHub comment: posted to PR #267

Scope confirmation:
IG-AUTH-2E.6J independent repository review only.
Agent B used a separate worktree on the shared machine.
No production database access.
No migration execution.
No migration repair or remote history edits.
No DB writes.
No environment or feature-flag changes.
No deployment.
No provider calls or outbound messages.
No merge performed.
```
