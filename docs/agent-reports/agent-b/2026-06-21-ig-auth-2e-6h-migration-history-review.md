# IG-AUTH-2E.6H Independent Review — Production Migration History Audit

> **Agent:** B
> **Date:** 2026-06-21
> **Branch:** `docs/ig-auth-2e-6h-migration-history-review`
> **Subject:** [PR #264](https://github.com/ctarasan/HubChat/pull/264) (Agent A IG-AUTH-2E.6G)
> **Reviewed SHA:** `d4bb2f61a826daf9796dc8275519827da694dd2b`
> **Base master SHA:** `98672c98056bc031188966a464478ae89b0f027c`
> **Worktree:** `D:\Project\AI CODING\HUB Chat-agent-b-pr264` (read-only review of PR #264)

---

## Verdict

**PASS — READY TO REQUEST GO MIGRATION HISTORY RECONCILIATION**

This review does **not** authorize migration history repair or migration execution.

---

## PR #264 metadata

| Field | Value |
| --- | --- |
| PR | [#264](https://github.com/ctarasan/HubChat/pull/264) |
| State | OPEN |
| Head branch | `docs/ig-auth-2e-6g-migration-history-audit` |
| Head SHA | `d4bb2f61a826daf9796dc8275519827da694dd2b` |
| Base branch | `master` |
| Expected SHA | `d4bb2f6` — **matches** |

Agent B did **not** modify PR #264 branch.

---

## Scope gate

Reviewed via `git diff origin/master...HEAD` in PR #264 worktree:

| Check | Result |
| --- | --- |
| Changed files | 2 (`docs/**` only) |
| Source / migration / schema / runtime changes | **None** |
| `git diff --check` | **Clean** |
| Verdict | **PASS** |

---

## Correct production target

| Check | Result |
| --- | --- |
| Correct target documented | SmartKorp production (`SmartKorp Hub Chat`, masked `dsky…hyx`) |
| Wrong-target history preserved | **Yes** — `Cursor_App` / `cawt…nkto` retained in §Wrong-target audit history |
| Evidence separation | Correct-target `pg_catalog` probes not mixed with wrong-target greenfield results |
| Full project ref in PR diff | **No** |

---

## Migration-history evidence

| Command | Documented result | Agent B check |
| --- | --- | --- |
| `supabase migration list --linked` | Remote blank ×25 | **Accepted** — consistent with absent `schema_migrations` table |
| `supabase db push --linked --dry-run` | Would push all 25 | **Accepted** — `--dry-run` explicitly stated |
| Production mutation | NONE | **Accepted** |

Prohibited actions not documented as performed:

```text
db push without --dry-run     — not reported
migration repair              — not reported
db pull                       — not reported
remote history edit           — not reported
DDL / data write              — not reported
```

---

## Audit matrix review (25 migrations)

Agent A matrix contains **25 rows**. Reported totals:

| Classification | Count | Agent B |
| --- | ---: | --- |
| PRESENT_EQUIVALENT | 20 | **Agree** |
| DATA_STATE_CONFIRMED | 1 | **Agree** |
| MISSING | 4 | **Agree** |
| PRESENT_DIVERGENT | 0 | **Agree** |

Agent B independently verified:

- Migration SQL in repository matches stated expected effects for all reviewed rows.
- Classifications are supported by cited production evidence (`pg_proc` signatures, column aggregates, enum labels, table existence counts, constraint definitions, residual data counts) — not filename alone.
- Safe-to-mark-applied conclusions apply only where effect is present and no further schema action is required.

**Non-blocking note:** Several matrix rows use concise evidence strings (e.g. “Table exists”) while detailed catalog proof is consolidated in §Correct-target schema probe summary. Acceptable for this audit phase; operator should re-verify catalog at repair time.

---

## Spot-check results (key migrations)

| Version | Migration intent (SQL read) | Production evidence cited | Agent B |
| --- | --- | --- | --- |
| `20260512120000` | 7 foundation cols + `conversation_events` + indexes | 11 lifecycle cols present (includes later additive cols); `conversation_events` table present | **Agree PRESENT_EQUIVALENT** |
| `20260512180000` | Add RESOLVED/ARCHIVED/UNQUALIFIED | Enum labels include all three | **Agree PRESENT_EQUIVALENT** |
| `20260513120000` | Sales agent assignment cols + enum | 4 cols + `sales_assignment_mode` enum | **Agree PRESENT_EQUIVALENT** |
| `20260520120000` | `channel_settings` table | Table exists | **Agree PRESENT_EQUIVALENT** |
| `20260527120000` | Bridge outbox + `claim_marketing_automation_bridge_outbox` | Table + function signature `(p_limit, p_processing_timeout_seconds)` | **Agree PRESENT_EQUIVALENT** |
| `20260601120000` | `tenant_sla_policies` | Table exists | **Agree PRESENT_EQUIVALENT** |
| `20260604120000` | CCP tables + enums | Tables + `channel_connection_status` enum | **Agree PRESENT_EQUIVALENT** |
| `20260608120000` | `channel_connection_id` + index | Column in foundation set; `idx_conversations_channel_connection` present | **Agree PRESENT_EQUIVALENT** |
| `20260614120000` | `oauth_transactions` + enum | Table + enum present | **Agree PRESENT_EQUIVALENT** |
| `20260619120000` | `instagram_oauth_credentials` + status enum | Table + enum present | **Agree PRESENT_EQUIVALENT** |

---

## Legacy 20260430 assessment

| File | Agent A finding | Agent B independent check |
| --- | --- | --- |
| `add_conversation_ids_to_outbound_function.sql` | 15-arg RPC incl. `p_conversation_ids`; overload count 1 | SQL adds `p_conversation_ids jsonb`; cited `pg_proc` signature matches intended effect |
| `reclassify_invalid_facebook_dm_threads.sql` | Residual count = 0 | SQL predicate matches cited aggregate query; count 0 confirms **DATA_STATE_CONFIRMED** |

| Question | Agent B |
| --- | --- |
| Function signature/behavior in production | **Confirmed equivalent** for intended effect |
| Data reclassification proven | **Yes** — residual 0, no customer content in evidence |
| Shared version `20260430` CLI limitation | **Acknowledged** — two files, one version key |
| Option B strategy | Preserve filenames; add unique reconciliation migration; avoid destructive re-execution |

**Legacy reconciliation classification:** **LEGACY_RECONCILIATION_SAFE**

Engineering must still **author** the Option B reconciliation migration before repair — strategy is safe; implementation is a follow-up.

---

## 21 repair candidates (Group A)

Exact list from PR #264 reconciliation plan:

```text
20260430_add_conversation_ids_to_outbound_function.sql
20260430_reclassify_invalid_facebook_dm_threads.sql
20260506, 20260509000100, 20260512120000, 20260512180000,
20260513120000, 20260514120000, 20260519120000, 20260520120000,
20260526120000, 20260527120000, 20260530120000, 20260531120000,
20260601120000, 20260602120000, 20260602154000, 20260604120000,
20260608120000, 20260614120000, 20260619120000
```

| Check | Result |
| --- | --- |
| Count | **21** |
| Excludes four MISSING migrations | **Yes** — `20260620120000`, `20260621120000`, `20260621130000`, `20260621140000` not listed |
| Each has production effect evidence | **Yes** — supported by matrix + schema probe summary |
| Hidden missing dependency | **None found** among candidates |

**Candidate verification:** **PASS**

---

## Four execution migrations (Group B)

| Version | Expected absence | Agent B |
| --- | --- | --- |
| `20260620120000` | `instagram_oauth_states` table + enum | Table count 0; enum count 0 — **MISSING confirmed** |
| `20260621120000` | Identity cols + constraint | `ig_identity_cols` null; constraint count 0 — **MISSING confirmed** |
| `20260621130000` | `p_instagram_credential_binding` | Binding param count 0; 15-arg RPC only — **MISSING confirmed** |
| `20260621140000` | Idempotent 2D reconcile | Same absence as 2D — **MISSING confirmed** |

**Execution order:** `20260620120000` → `20260621120000` → `20260621130000` → `20260621140000` — **documented and correct** (2C before 2D/2E.3; master file order preserved).

No other migration classified safe-to-mark-applied shows MISSING evidence in cited probes.

---

## Approval separation

PR #264 reconciliation plan separates:

| Phase | Approval | Action |
| --- | --- | --- |
| 1 | `GO MIGRATION HISTORY RECONCILIATION` | Repair verified history only; Option B for `20260430`; **no real pending execution** |
| 2 | Verification | `migration list` + `db push --dry-run`; require pending = 4 files |
| 3 | `GO MIGRATION WINDOW` | Execute four approved migrations only |

History repair and migration execution are **not** combined under one approval. **PASS**

---

## Security review

PR #264 diff scanned for secrets and customer data:

| Pattern | In PR #264 new docs |
| --- | --- |
| Full project ref | **Not present** (masked `dsky…hyx`, `cawt…nkto` only) |
| `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL`, service keys | **Not present** in new docs |
| Customer data / message content / raw payload | **Not present** |
| Bearer tokens / signed URLs | **Not present** |

**Security scan:** **PASS**

---

## Mutation check

Agent B performed **read-only** review only. No production mutation by Agent B.

Agent A attestation in PR #264:

```text
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

**Accepted.**

---

## Blocking findings

**None.**

---

## Non-blocking notes

1. **`schema_migrations` table absent** — history repair may require bootstrap/operator runbook beyond standard `migration repair`; not a blocker for requesting reconciliation approval.
2. **`claim_queue_jobs` dual overload** — legacy 2-arg coexists with 3-arg; documented as non-blocking; optional cleanup in Group E.
3. **Option B reconciliation migration** — strategy approved as safe; engineering artifact still required before repair execution.
4. **Per-row evidence granularity** — some matrix rows rely on consolidated probe summary; re-verify at repair window.

---

## Required amendments

**None** for PASS.

---

## Recommendation

**READY TO REQUEST GO MIGRATION HISTORY RECONCILIATION**

Operator sequence:

1. Engineering authors Option B unique reconciliation migration for legacy `20260430` (if repair cannot represent both files).
2. Operator issues **`GO MIGRATION HISTORY RECONCILIATION`**.
3. Repair Group A (21 versions) only; re-run dry-run; confirm pending = 4.
4. Separate **`GO MIGRATION WINDOW`** for Group B execution.

---

## GitHub comment

Posted to PR #264 (see completion report).

---

## Completion report

```text
Review result: PASS — READY TO REQUEST GO MIGRATION HISTORY RECONCILIATION
Agent A PR: #264
Reviewed SHA: d4bb2f61a826daf9796dc8275519827da694dd2b
Agent B branch: docs/ig-auth-2e-6h-migration-history-review
Agent B commit: e20a293
Agent B PR: #265
Base master: 98672c98056bc031188966a464478ae89b0f027c

Scope gate: PASS (docs/** only)
Correct production target: YES (dsky…hyx)
Wrong-target history preserved: YES (cawt…nkto section retained)
Migration list evidence: YES (remote blank ×25)
Dry-run evidence: YES (--dry-run, all 25 pending pre-repair)

Total migrations reviewed: 25
PRESENT_EQUIVALENT: 20
DATA_STATE_CONFIRMED: 1
MISSING: 4
PRESENT_DIVERGENT: 0

21 repair candidates: verified
Candidate verification: PASS
Four execution migrations: confirmed MISSING
Execution order: 20260620120000 → 20260621120000 → 20260621130000 → 20260621140000

Legacy function evidence: pg_proc 15-arg incl. conversation_ids — confirmed
Legacy data evidence: residual count 0 — confirmed
Legacy reconciliation classification: LEGACY_RECONCILIATION_SAFE (Option B)

Mutation check: NONE (read-only review)
Security scan: PASS
Blocking findings: none
Non-blocking notes: schema_migrations absent; Option B migration not yet authored; claim_queue_jobs dual overload
Required amendments: none
Recommendation: READY TO REQUEST GO MIGRATION HISTORY RECONCILIATION
GitHub comment: posted to PR #264

Scope confirmation:
IG-AUTH-2E.6H independent read-only review only.
Agent B worked in separate Git worktrees on the shared machine.
No migration execution. No migration repair or remote history edits.
No DDL or data writes. No environment or feature-flag changes.
No deployment. No provider calls or outbound messages. No merge performed.
```
