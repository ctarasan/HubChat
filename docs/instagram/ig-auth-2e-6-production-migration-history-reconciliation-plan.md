# IG-AUTH-2E.6 Production Migration History Reconciliation Plan

Sanitized reconciliation **plan only** from IG-AUTH-2E.6G read-only audit (correct-target rerun on SmartKorp production). **No migration execution, repair, DDL/DML, or history edits were performed.**

**Related:** [Agent A audit report](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6g-migration-history-audit.md) · [PR #264](https://github.com/ctarasan/HubChat/pull/264) · [2E.5 production evidence](ig-auth-2e-5-production-read-only-evidence.md)

---

## Wrong-target audit history

PR #264 initial commit (`b7be939`) audited **`Cursor_App` / `cawt…nkto`** — **WRONG TARGET**. That pass showed a greenfield/partial schema (no `conversations`, no outbound RPC, no migration history table).

That evidence is **retained** in the Agent A report §Wrong-target audit history. It must **not** drive reconciliation decisions. This plan reflects the **correct-target rerun** on SmartKorp production (`dsky…hyx`).

---

## Correct production target verification

| Item | Value |
| --- | --- |
| Project | SmartKorp production (`SmartKorp Hub Chat`) |
| Ref (masked) | `dsky…hyx` |
| CLI link | **SUCCESS** |
| Matches Vercel production `SUPABASE_URL` | **Yes** (host prefix/suffix) |
| Full ref committed | **No** |
| Correct production target verified | **YES** |

---

## Production baseline

| Check | SmartKorp production |
| --- | --- |
| `schema_migrations` table | **Does not exist** (`to_regclass` → null) |
| CLI remote history | **Blank** for all 25 local versions |
| Mature schema | **Present** — applied outside CLI tracking |
| Outbound RPC | 15-arg with `p_conversation_ids`; **no** binding param |
| Queue gates | PENDING 0, PROCESSING 0 |
| Production mutation (this phase) | **NONE** |

---

## Correct-target migration list

```text
supabase migration list --linked     → SUCCESS
Remote column:                       blank ×25
```

Both `20260430` files show blank remote. No version recorded in CLI history.

---

## Correct-target dry-run

```text
supabase db push --linked --dry-run    → SUCCESS
Would push:                            all 25 files
Writes:                                NONE
```

**Current state:** entire local chain appears pending because migration history is untracked.

**Target end state after history repair:**

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

Dry-run must show **exactly these 4** before `GO MIGRATION WINDOW`.

---

## 25-migration production audit matrix

Full matrix: [Agent A report §25-migration production audit matrix](../agent-reports/agent-a/2026-06-21-ig-auth-2e-6g-migration-history-audit.md#25-migration-production-audit-matrix).

| Classification | Count | Notes |
| --- | ---: | --- |
| PRESENT_EQUIVALENT | 20 | Verified via `pg_catalog` on SmartKorp |
| DATA_STATE_CONFIRMED | 1 | `20260430` reclassify (residual 0) |
| MISSING | 4 | 2C + IG OAuth trio |
| PRESENT_DIVERGENT | 0 | |
| DATA_STATE_UNKNOWN | 0 | |

---

## Legacy 20260430 assessment

| File | Effect in production | Classification |
| --- | --- | --- |
| `add_conversation_ids_to_outbound_function.sql` | 15-arg RPC incl. `p_conversation_ids` | **PRESENT_EQUIVALENT** |
| `reclassify_invalid_facebook_dm_threads.sql` | Residual misclassified rows = 0 | **DATA_STATE_CONFIRMED** |

| Question | Answer |
| --- | --- |
| Function signature equivalent? | **Yes** for intended effect (pre-binding 15-arg) |
| Data reclassification proven? | **Yes** — aggregate count 0 |
| Shared version reconcile? | **Unresolved** — CLI cannot store two files under one `20260430` key |
| Unique reconciliation migration needed? | **Yes (recommended)** — Option B below |

### Reconciliation options (PROPOSED ONLY — NOT AUTHORIZED)

| ID | Approach | Recommendation |
| --- | --- | --- |
| **A** | Rename one legacy file + idempotent reconciliation | Review required |
| **B** | Keep filenames; add new unique reconciliation migration | **Preferred** |
| **C** | Mark one `20260430` applied + new reconciliation | High risk |
| **D** | HOLD on data state | **No longer needed** — data confirmed |

**Do not** rename files or edit remote history in this phase.

---

## IG OAuth trio assessment

| Version | File | SmartKorp evidence | Classification |
| --- | --- | --- | --- |
| `20260621120000` | 2D identity verification | Identity cols absent | **MISSING** |
| `20260621130000` | 2E.3 outbound binding | `p_instagram_credential_binding` absent | **MISSING** |
| `20260621140000` | 2D idempotent reconcile | Same as 2D | **MISSING** |

**Also MISSING:** `20260620120000` (2C `instagram_oauth_states` table and enum absent). Include in Group B execution set.

---

## Reconciliation groups

### GROUP A — verified safe candidates to mark applied

21 migrations with catalog proof:

```text
20260430_add_conversation_ids_to_outbound_function.sql
20260430_reclassify_invalid_facebook_dm_threads.sql
20260506, 20260509000100, 20260512120000, 20260512180000,
20260513120000, 20260514120000, 20260519120000, 20260520120000,
20260526120000, 20260527120000, 20260530120000, 20260531120000,
20260601120000, 20260602120000, 20260602154000, 20260604120000,
20260608120000, 20260614120000, 20260619120000
```

Mark via future `migration repair` **only** after independent review approves each version.

### GROUP B — must execute real migration

```text
20260620120000_ig_auth_2c_instagram_oauth_states.sql
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

### GROUP C — needs new idempotent reconciliation migration

- Legacy `20260430` shared version collision (Option B: new unique timestamp migration documenting both effects as live)

### GROUP D — data state unknown / operator decision

- **None** (20260430 data state now confirmed)

### GROUP E — production divergence / engineering fix

| Object | Note | Blocking? |
| --- | --- | --- |
| `claim_queue_jobs` | Legacy 2-arg overload coexists with 3-arg | **No** — intended effect present |
| Outbound RPC | 15-arg pre-binding (not divergent legacy) | **No** — pending 2E.3 apply |
| Shared `20260430` version | CLI history collision | **Yes** for repair until Option B |

---

## Proposed history reconciliation plan

All steps **PROPOSED ONLY — NOT AUTHORIZED** unless explicitly approved.

### Step 1 — Independent review

Review Group A list (21 versions) and Option B for `20260430`.

### Step 2 — Engineering (repository)

Add unique reconciliation migration for `20260430` collision if repair cannot represent both files under one version key.

### Step 3 — Operator approval

```text
GO MIGRATION HISTORY RECONCILIATION
```

### Step 4 — History repair (example pattern only)

```text
# PROPOSED ONLY — NOT AUTHORIZED
# supabase migration repair --status applied 20260506
# … repeat for each verified Group A version
# Do NOT repair Group B versions
```

For duplicate `20260430`: repair once for version key after Option B migration merged, or repair both effects via reconciliation migration per engineering review.

### Step 5 — Verify pending set

```text
supabase migration list --linked
supabase db push --linked --dry-run
```

**Require exact pending set:**

```text
20260620120000
20260621120000
20260621130000
20260621140000
```

If mismatch → **STOP** and re-audit.

### Step 6 — Separate migration window

```text
GO MIGRATION WINDOW
```

Apply Group B in master order. Post-apply checks:

- `pg_proc`: single outbound RPC overload with binding param
- Identity columns + constraint on `instagram_oauth_credentials`
- `instagram_oauth_states` table present

### Step 7 — Rollout (out of scope)

Per IG-AUTH-2E runbook: flags-off deploy → canary approvals.

---

## Stop conditions

| # | Condition | Status |
| --- | --- | --- |
| 1 | Wrong linked project | **Clear** (correct target verified) |
| 2 | Insufficient catalog evidence | **Clear** |
| 3 | Dry-run after repair ≠ 4 pending files | **Pending** (repair not run) |
| 4 | Legacy `20260430` collision unresolved | **Open** — Option B review required before repair |
| 5 | RPC overload ambiguity after 2E.3 apply | Re-check at window |
| 6 | APP-before-DB (binding param) | **Known** — DB-first for 2E.3 |
| 7 | Active OAuth-bound queue jobs | **Clear** (0/0) |

---

## Security sanitization

- Masked project refs only; no full ref or connection strings
- Aggregate counts and catalog metadata; no customer content
- Read-only SQL transactions for all probes
- Temporary audit scripts excluded from PR

---

## Decision

**READY_FOR_INDEPENDENT_REVIEW**

Correct-target production audit is complete with `pg_catalog` evidence. Independent review should validate Group A repair list and Option B for legacy `20260430` before any `GO MIGRATION HISTORY RECONCILIATION`.

---

## Required attestation

```text
Correct production target verified: YES
Production migration list read: YES
Production dry-run performed: YES
Production migration executed: NONE
Migration repair executed: NONE
Migration-history edits: NONE
DDL/data writes: NONE
Queue mutations: NONE
Environment changes: NONE
Deployments: NONE
Provider calls: NONE
Outbound messages: NONE
```

---

## Scope confirmation

```text
IG-AUTH-2E.6G read-only production migration-history audit only.
No migration execution. No migration repair or remote history edits.
No DDL or data writes. No queue/environment mutation.
No deployment. No provider calls or outbound messages. No merge performed.
```
