# IG-AUTH-2E.6 Production Migration History Reconciliation Plan

Sanitized reconciliation **plan only** from IG-AUTH-2E.6G read-only audit. **No migration execution, repair, DDL/DML, or history edits were performed.**

**Related:** [Agent A audit report](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6g-migration-history-audit.md) · [2E.6E readiness recheck](ig-auth-2e-6-migration-readiness-recheck.md) · [2E.5 production evidence](ig-auth-2e-5-production-read-only-evidence.md)

---

## Production baseline

| Item | Value |
| --- | --- |
| SmartKorp production ref (masked) | `dsky…hyx` |
| Vercel / Railway `SUPABASE_URL` host | Matches `dsky…hyx` (prior phases) |
| CLI linked project this audit | `Cursor_App` (`cawt…nkto`) — **wrong target** |
| Remote migration history (CLI linked) | Empty for all 25 local versions |
| `schema_migrations` (CLI linked) | Table **does not exist** |
| SmartKorp migration history | **Untracked / unknown** — mature schema applied outside CLI history |
| IG OAuth effects on SmartKorp | 2A/2C **present**; 2D/2E.3/2E.6 reconcile **missing** |
| Production decision (prior + this audit) | **HOLD** |

---

## Dry-run result

Executed on **linked** project only (`Cursor_App`):

```text
Command:  supabase db push --linked --dry-run
Result:   SUCCESS — would push all 25 migration files
Writes:   NONE (dry-run)
Remote:   Empty history for every local version
```

**Expected pending set on SmartKorp after history reconciliation (target end state):**

```text
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

Current dry-run on the **wrong** linked project shows all 25 pending — **not** SmartKorp production state.

---

## 25-migration audit matrix

Full per-file matrix with classifications, risk, and reconciliation notes: see [Agent A audit report §25-migration audit matrix](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6g-migration-history-audit.md#25-migration-audit-matrix-smartkorp-production-classification).

Summary counts (SmartKorp target):

| Classification | Count | Versions |
| --- | ---: | --- |
| PRESENT_EQUIVALENT | 21 | 20260430 function (inf), 20260506–20260620120000 |
| MISSING | 3 | 20260621120000, 20260621130000, 20260621140000 |
| DATA_STATE_UNKNOWN | 1 | 20260430 reclassify |
| PRESENT_DIVERGENT | 0 | — |
| DATA_STATE_CONFIRMED | 0 | — |

---

## Legacy 20260430 analysis

Two local files share version prefix **`20260430`**:

| File | Type | Intended effect |
| --- | --- | --- |
| `20260430_add_conversation_ids_to_outbound_function.sql` | FUNCTION | Add `p_conversation_ids jsonb` to `create_outbound_message_with_outbox` |
| `20260430_reclassify_invalid_facebook_dm_threads.sql` | DATA | UPDATE misclassified Facebook `conversations` rows |

### Verification status

| Check | SmartKorp | Linked CLI |
| --- | --- | --- |
| Outbound RPC exists | **Yes** (OpenAPI) | **No** |
| `p_conversation_ids` in signature | **Likely** (not `pg_proc`-verified) | **No** |
| Reclassify residual count = 0 | **Unknown** | **Not runnable** (no `conversations`) |
| Remote `20260430` history row | **Unknown** | **None** |

### Reconciliation options (PROPOSED ONLY — NOT AUTHORIZED)

| ID | Approach | Pros | Cons |
| --- | --- | --- | --- |
| **A** | Rename one legacy migration + add idempotent reconciliation SQL | Clear CLI ordering | Rewrites repo history naming; needs review |
| **B** | Keep legacy filenames; add **new** unique reconciliation migration(s) | Minimal rename churn | Extra migration file(s) |
| **C** | `migration repair` one `20260430` + execute new reconciliation | Fast if operator-confident | Risky if wrong file marked applied |
| **D** | **HOLD** until data state proven | Safest | Blocks history repair |

**Recommendation:** **Option B or D** until SmartKorp Postgres confirms reclassify residual count and function signature.

---

## IG OAuth trio

| Version | File | SmartKorp state | Action |
| --- | --- | --- | --- |
| `20260621120000` | 2D identity verification | **MISSING** | Execute in migration window |
| `20260621130000` | 2E.3 outbound binding RPC | **MISSING** | Execute in migration window |
| `20260621140000` | 2D idempotent reconcile | **MISSING** | Execute after 2E.3 (idempotent with 2D) |

**Ordering constraint:** Apply 2D → 2E.3 → 2E.6 reconcile (master order). Verify `pg_proc` overload count = 1 and binding parameter present before any OAuth flag rollout.

---

## Safe applied candidates (Group A)

Candidates to mark **`applied`** via future `migration repair` **only after** SmartKorp `pg_catalog` verification:

```text
20260506, 20260509000100, 20260512120000, 20260512180000,
20260513120000, 20260514120000, 20260519120000, 20260520120000,
20260526120000, 20260527120000, 20260530120000, 20260531120000,
20260601120000, 20260602120000, 20260602154000, 20260604120000,
20260608120000, 20260614120000, 20260619120000, 20260620120000
```

Likely additional candidate:

```text
20260430_add_conversation_ids_to_outbound_function.sql  (after pg_proc signature match)
```

**Do not mark applied** without per-object proof. **Do not mark applied:** IG OAuth trio, 20260430 reclassify (until DATA_STATE_CONFIRMED or idempotent re-run approved).

---

## Real execution required (Group B)

Must run real SQL on SmartKorp (not repair-only):

```text
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

---

## Divergent objects (Group E)

| Object | Expected | SmartKorp | Status |
| --- | --- | --- | --- |
| `create_outbound_message_with_outbox` | 16 params incl. binding | 15 params (OpenAPI) | **Pending 2E.3** — not divergent legacy |
| `instagram_oauth_credentials` identity cols | 3 columns + check | Absent | **MISSING** — execute 2D/2E.6 |
| Shared `20260430` version key | Two distinct files | CLI cannot represent both | **LEGACY_COLLISION_UNRESOLVED** |

No confirmed **PRESENT_DIVERGENT** objects (wrong signature on live object) beyond the intentional pre-IG-migration RPC gap.

---

## Unknown data migrations (Group D)

| Migration | Condition to prove | Query (read-only) |
| --- | --- | --- |
| `20260430_reclassify_invalid_facebook_dm_threads` | Residual misclassified rows = 0 | `SELECT count(*) FROM conversations WHERE provider_thread_type='MESSENGER_DM' AND channel_type='FACEBOOK' AND provider_external_user_id IS NOT NULL AND (channel_thread_id IS NULL OR channel_thread_id NOT LIKE 'user:%')` |

Until run on **SmartKorp** Postgres: classification remains **DATA_STATE_UNKNOWN**.

---

## Proposed reconciliation sequence

All steps require separate operator approvals. Labels **PROPOSED ONLY — NOT AUTHORIZED**.

### Phase 0 — Prerequisites (blocking)

1. Re-link Supabase CLI to SmartKorp production (`dsky…hyx`) or provide read-only `DATABASE_URL`.
2. Run SmartKorp read-only catalog audit (`pg_proc`, `information_schema`, enum labels, index names).
3. Confirm queue gates (PENDING/PROCESSING/OAuth-bound = 0).
4. Confirm OAuth delivery flags remain ABSENT.

### Phase 1 — Engineering (repository)

1. Resolve legacy `20260430` collision (Option B recommended): add unique reconciliation migration if needed.
2. Independent review of repair candidate list vs catalog audit.

### Phase 2 — Operator approval

```text
GO MIGRATION HISTORY RECONCILIATION
```

### Phase 3 — History repair (PROPOSED ONLY — NOT AUTHORIZED)

Example pattern only — **do not run without approval and verified catalog**:

```text
# PROPOSED ONLY — NOT AUTHORIZED
# After catalog proof, mark verified historical versions applied, e.g.:
# supabase migration repair --status applied 20260506
# … (one version at a time, verified equivalents only)
# Do NOT repair 20260621120000–20260621140000 until execution window
```

### Phase 4 — Verify pending set

```text
supabase migration list --linked
supabase db push --linked --dry-run
```

**Require exact expected pending set:**

```text
20260621120000
20260621130000
20260621140000
```

If dry-run shows additional pending files → **STOP** and re-audit.

### Phase 5 — Separate migration window

```text
GO MIGRATION WINDOW
```

Apply approved pending trio only. Post-apply: `pg_proc` overload check, OpenAPI binding param, identity columns.

### Phase 6 — Rollout (out of scope for 2E.6G)

Flags-off deploy verification → canary approvals per IG-AUTH-2E runbook.

---

## Stop conditions

| # | Condition | Action |
| --- | --- | --- |
| 1 | Linked project ≠ SmartKorp production | **STOP** — re-link |
| 2 | Dry-run pending set ≠ `{21120000, 21130000, 21140000}` after repair | **STOP** — re-audit |
| 3 | `pg_proc` shows RPC overload ambiguity | **STOP** — engineering fix |
| 4 | Active OAuth-bound queue jobs | **STOP** — drain first |
| 5 | 20260430 data state unknown and repair would skip reclassify | **STOP** — Option D |
| 6 | APP deployed requiring binding param before DB migrate | **HOLD** — DB-first (known from 2E.5A) |

---

## Security sanitization

- Evidence uses masked project refs and aggregate counts only
- No secrets, tokens, message bodies, or customer identifiers
- Read-only transactions (`BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;`) for SQL probes
- Temporary local audit scripts excluded from PR

---

## Decision

**HOLD — INSUFFICIENT_EVIDENCE**

Rationale:

1. CLI audit ran against **`Cursor_App`**, not SmartKorp production.
2. SmartKorp `pg_catalog` verification not completed in this phase.
3. Legacy `20260430` data migration state unproven.
4. Shared `20260430` version collision remains **LEGACY_COLLISION_UNRESOLVED**.

**Not** `READY_FOR_INDEPENDENT_REVIEW` until operator completes Phase 0 on the correct project.

**Next approval required:**

```text
1. Operator: link CLI to SmartKorp production + SmartKorp catalog audit
2. Independent review of repair candidate list
3. GO MIGRATION HISTORY RECONCILIATION
4. (Later) GO MIGRATION WINDOW for IG OAuth trio
```

---

## Scope confirmation

```text
IG-AUTH-2E.6G read-only production migration-history audit only.
No migration execution. No migration repair or remote history edits.
No DDL or data writes. No queue/environment mutation.
No deployment. No provider calls or outbound messages. No merge performed.
```
