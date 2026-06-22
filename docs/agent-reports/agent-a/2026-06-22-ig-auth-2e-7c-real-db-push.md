# IG-AUTH-2E.7C — Controlled Production Execution of Five Linked Migrations

> **Agent:** A
> **Date:** 2026-06-22
> **Task:** IG-AUTH-2E.7C
> **Type:** Production execution evidence (docs-only branch)

---

## Operator authorization

```text
GO REAL DB PUSH LINKED — FIVE MIGRATIONS
```

---

## Execution context

| Field | Value |
| --- | --- |
| Execution master SHA | `987b71a2f9f577916c53e8e973e71614d97f352e` |
| CLI version | `2.98.2` |
| Linked target (safe reference) | `dsky…hyx` (SmartKorp Hub Chat production) |
| Execution start UTC | `2026-06-22T07:28:18Z` |
| Execution end UTC | `2026-06-22T07:28:28Z` |
| Worker pause attestation UTC | `2026-06-22T07:27:26Z` (exclusive window; outbound queue baseline 0) |
| Worker resumed UTC | `2026-06-22T07:31:42Z` (post-verification; queue/outbox healthy) |

---

## Pre-execution state

### Migration list

| Version | Local | Remote |
| --- | --- | --- |
| `20260501120000` | present | applied |
| `20260620120000` | present | blank |
| `20260621120000` | present | blank |
| `20260621130000` | present | blank |
| `20260621140000` | present | blank |
| `20260621150000` | present | blank |

Pending count: **5** | Unexpected divergence: **NO**

### Checksums (unchanged)

| Version | SHA-256 |
| --- | --- |
| `20260620120000` | `b4ddab7340da03faab4b2eee7c082a1c3bc4951c06d681b22be876acf6107834` |
| `20260621120000` | `faffa882f0b051138658e6d133ce4eeeda6e133f8cf1a2a3e70b34d0548b050e` |
| `20260621130000` | `0db03064e0283c29f8f089529c6634c51cc91618a2d6fe2b5f1ff67a6fde7068` |
| `20260621140000` | `83a7958b93b4d42381d2020547652c7618a8e84890ab006ef816aafd81cdb04e` |
| `20260621150000` | `c809c8f38c0170392b49e7626a00dd2c20c4e622c81ca2b2f5e0d2f472eff880` |

### Final prechecks

| Check | Result |
| --- | --- |
| Residual reclassification rows | **0** |
| Credential constraint violations | **0** (columns absent pre-push) |
| Function catalog baseline | Legacy 15-arg overload only |
| Expanded overload pre-push | **null** (expected) |
| Outbound queue PENDING | **0** |
| Outbound queue PROCESSING | **0** |
| Outbox PENDING (outbound topic) | **0** |

---

## Command executed

```bash
supabase db push --linked
```

| Field | Value |
| --- | --- |
| Exit code | **0** |
| Sanitized stdout | Applied 5 migrations in order: `20260620120000`, `20260621120000`, `20260621130000`, `20260621140000`, `20260621150000`; `Finished supabase db push.` |
| Sanitized NOTICE | Constraint drop skipped (not exist); reconcile migration idempotent column skips on `20260621140000` |
| Second push attempted | **NO** |
| Dry-run repeated | **NO** |
| Repair executed | **NO** |

---

## Post-execution migration history

| Version | Local | Remote |
| --- | --- | --- |
| `20260620120000` | present | **applied** |
| `20260621120000` | present | **applied** |
| `20260621130000` | present | **applied** |
| `20260621140000` | present | **applied** |
| `20260621150000` | present | **applied** |

Pending count: **0** | Unexpected divergence: **NO** | Split rows: **NO**

---

## Post-execution schema verification

| Check | Result |
| --- | --- |
| `instagram_oauth_states` table | exists (1) |
| `instagram_oauth_state_status` enum | exists (1) |
| OAuth state indexes (4 expected) | **4** |
| OAuth state constraints (incl. PK/FK/CHECK) | **6** |
| Credential identity columns (3) | **3** |
| Credential constraint violations | **0** |
| Legacy `regprocedure` OID | non-null |
| Expanded `regprocedure` OID | non-null |
| Expanded definition contains `instagramCredentialBinding` | **true** |
| Legacy overload retained | **YES** (DO NOT DROP) |
| Unexpected overload | **NO** (reviewed legacy + expanded set) |

---

## Post-execution data verification

| Check | Result |
| --- | --- |
| Residual reclassification rows | **0** |
| Credential constraint violations | **0** |
| OAuth provider-scope violations | **0** |
| OAuth claim-timestamp violations | **0** |
| Outbound queue PENDING post-resume | **0** |
| Outbox PENDING post-resume | **0** |

---

## Application smoke

Automated browser smoke not executed from Agent A environment. Operator/Agent B should confirm per readiness plan:

- Dashboard / Channel Settings load
- Instagram connection APIs not 500
- Inbox / Leads / Work Queue APIs not 500
- No OAuth reconnect or credential rotation performed

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| 20-version repair repeated | NO |
| Additional repair | NO |
| Dry-run repeated | NO |
| Second real push | NO |
| Manual rollback | NO |
| Legacy function DROP | NO |

---

## Completion report

```text
IG-AUTH-2E.7C REAL DB PUSH RESULT

Authorization:
GO REAL DB PUSH LINKED — FIVE MIGRATIONS

Execution master SHA: 987b71a2f9f577916c53e8e973e71614d97f352e
CLI version: 2.98.2
Execution target verified: YES (dsky…hyx)
Execution timestamp UTC: 2026-06-22T07:28:18Z – 2026-06-22T07:28:28Z
Worker pause confirmed: YES (exclusive window attestation)

Pre-execution:
- Pending count: 5
- Pending versions: 20260620120000 … 20260621150000
- Residual reclassification rows: 0
- Credential constraint violation rows: 0
- Function catalog baseline: legacy 15-arg only
- Unexpected overload: NO

Command executed:
supabase db push --linked

Command exit code: 0
Sanitized result: Finished supabase db push; 5 migrations applied

Post-execution migration history:
- 20260620120000: local + remote applied
- 20260621120000: local + remote applied
- 20260621130000: local + remote applied
- 20260621140000: local + remote applied
- 20260621150000: local + remote applied
- Pending count: 0
- Unexpected divergence: NO

Post-execution schema:
- OAuth state objects: PASS
- OAuth CHECK constraints: PASS (6 constraints)
- OAuth FK: PASS
- Instagram credential columns/constraint: PASS (3 columns, 0 violations)
- Expanded function signature: non-null regprocedure, has_binding true
- Legacy overload state: present (retained)
- Unexpected overload: NO
- Function definition verified: YES

Post-execution data:
- Residual reclassification rows: 0
- Credential constraint violation rows: 0
- OAuth state violation rows: 0

Worker resumed: YES (2026-06-22T07:31:42Z)
Queue/outbox health: PENDING counts 0
Read-only application smoke: PENDING Agent B manual confirmation

20-version repair repeated: NO
Additional repair executed: NO
Dry-run repeated: NO
Second real push attempted: NO
Manual rollback executed: NO

Decision:
REAL DB PUSH PASS

Operational state:
HOLD — NO ADDITIONAL MIGRATION OPERATION
```
