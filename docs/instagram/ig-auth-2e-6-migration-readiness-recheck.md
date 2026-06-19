# IG-AUTH-2E.6E Migration Readiness Recheck

Sanitized read-only recheck after PR #261 migration-version collision remediation. **No production migration, dry-run, repair, or mutation performed.**

---

## Scope

Read-only readiness verification for a future `GO MIGRATION WINDOW`. Allowed: PostgREST read-only schema/queue probes, env name inspection, deployment SHA capture. Not allowed: `supabase db push` without `--dry-run`, migration repair, DDL/DML, flag changes, deploy.

---

## Master baseline

| Item | Value |
| --- | --- |
| Master SHA | `f4b5c351fd320e64c60923a0bb7eed0748b4efe5` |
| PR #258 / #259 / #261 | On master (#261 at HEAD) |
| Evidence branch | `docs/ig-auth-2e-6e-migration-readiness-recheck` |
| Execution (Asia/Bangkok) | 2026-06-19 ~16:20 |

Current Instagram OAuth migration order on master:

| Version | File |
| --- | --- |
| `20260621120000` | `ig_auth_2d_instagram_oauth_identity_verification.sql` |
| `20260621130000` | `ig_auth_2e3_outbound_instagram_binding.sql` |
| `20260621140000` | `ig_auth_2d_instagram_oauth_identity_reconcile.sql` |

---

## CLI and admin-path readiness

| Check | Result |
| --- | --- |
| Supabase CLI installed | **Yes** |
| CLI version | `2.98.2` |
| `SUPABASE_ACCESS_TOKEN` in shell | **Absent** |
| `supabase login` session | **Not established** |
| `supabase link` / `config.toml` | **Not configured** |
| `DATABASE_URL` in Vercel production env | **Absent** |
| PostgREST service-role read path | **Available** (aggregate/schema probes only) |

**Authorized production DB admin path:** **UNAVAILABLE**

Paths A (CLI linked) and B (`DATABASE_URL` for list/dry-run) could not be used. `migration list` and `db push --dry-run` were **not executed**.

---

## Production project identity

| Field | Value |
| --- | --- |
| Target | Production Supabase |
| Project ref (masked) | `dsky…nhyx` |
| Host (masked) | `dsky…hyx.supabase.co` |
| Confirmed via | Vercel production `SUPABASE_URL` host match to prior authorized read-only preflights |
| Staging/personal project | **Not used** |

Identity confirmed for **read-only PostgREST** probes only — not sufficient for CLI migration history.

---

## Local migration versions

### 14-digit timestamp duplicates

**None** (scan returned zero groups).

### Legacy 8-digit duplicate

| Version | Files |
| --- | --- |
| `20260430` | `20260430_add_conversation_ids_to_outbound_function.sql` |
| `20260430` | `20260430_reclassify_invalid_facebook_dm_threads.sql` |

---

## Remote migration history

| Field | Value |
| --- | --- |
| `supabase migration list` | **Not executed** (no admin path) |
| Classification | **UNKNOWN** |

Cannot compare local vs remote versions without operator-provided CLI auth or `DATABASE_URL`.

---

## Dry-run pending set

| Field | Value |
| --- | --- |
| `supabase db push --dry-run` | **Not executed** |
| Classification | **UNKNOWN** |

Expected apply set on clean IG-only pending baseline:

```text
20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql
20260621130000_ig_auth_2e3_outbound_instagram_binding.sql
20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql
```

Cannot confirm `EXACT_EXPECTED_SET` without dry-run.

---

## Legacy 20260430 duplicate analysis

| Question | Finding (local / inferred) |
| --- | --- |
| CLI version key | Both files share prefix `20260430` |
| Alphabetical order | `add_conversation_ids…` before `reclassify_invalid…` |
| Remote `20260430` recorded? | **Unknown** (no migration list) |
| Either file pending? | **Unknown** |
| Dry-run rejection? | **Not tested** |
| Alters IG OAuth apply set? | **Unknown** — production is mature; likely most pre-IG migrations already applied; legacy duplicate predates IG OAuth chain |

**Classification:** `LEGACY_DUPLICATE_STATE_UNKNOWN`

Production outbound features imply early migrations (including conversation_ids RPC changes) are live, suggesting `20260430` may already be recorded remotely. This **does not** block later 14-digit versions in typical Supabase CLI behavior, but **cannot be certified non-blocking** without `migration list` + `--dry-run`.

---

## Production schema baseline

Read-only probes (PostgREST + safe column select), 2026-06-19 ~16:20 +07:

| Check | State | Expected pre-migration |
| --- | --- | --- |
| `verified_username` | **ABSENT** | ABSENT |
| `verified_account_type` | **ABSENT** | ABSENT |
| `identity_verified_at` | **ABSENT** | ABSENT |
| `p_instagram_credential_binding` in OpenAPI | **ABSENT** | ABSENT |
| RPC overload count (`pg_proc`) | **Not queried** (no Postgres session) | — |

Schema remains in expected **pre-IG-migration** state for 2D/2E.3 effects.

---

## Queue gates

| Metric | Count |
| --- | ---: |
| Outbound PENDING | 0 |
| Outbound PROCESSING | 0 |
| Stale PROCESSING (>15 min) | 0 |
| OAuth-bound PENDING | 0 |
| OAuth-bound PROCESSING | 0 |
| Malformed bindings | 0 |

**Queue gate:** PASS

---

## Flag states

### Railway worker production

All five `HUBCHAT_INSTAGRAM_OAUTH_*` delivery flags: **ABSENT**

### Vercel Production

No `HUBCHAT_INSTAGRAM_OAUTH_*` names in `vercel env ls production` → **ABSENT**

**Flag gate:** PASS

---

## Deployment baseline

| Surface | SHA / state |
| --- | --- |
| Master | `f4b5c35` |
| Railway worker | `f4b5c35` (VERIFIED), deployment `df44…3829`, SUCCESS |
| Vercel Production | Ready (~16:09 +07); SHA **INFERRED** `f4b5c35` (same merge window as Railway) |
| Worker `/ready` | Not re-probed this session (prior session: HTTP 200) |

**Deployment drift:** None observed vs master.

---

## Security sanitization

- No access tokens, database URLs, passwords, service keys, or connection strings in evidence
- Project ref masked (`dsky…nhyx`)
- Temporary `.env.ig2e6e-prod` deleted after capture
- Local runner script not committed

---

## Decision

| Outcome | Value |
| --- | --- |
| **Decision** | **HOLD** |
| Ready to reissue `GO MIGRATION WINDOW`? | **No** |

### Blocking findings

1. **PRODUCTION_DB_ADMIN_PATH_UNAVAILABLE** — cannot run `migration list` or `db push --dry-run`
2. **Dry-run pending set unverified** — cannot confirm `EXACT_EXPECTED_SET`
3. **Legacy `20260430` duplicate** — remote impact **unknown** without migration history

### Non-blocking notes

- PR #261 collision remediated locally (zero 14-digit duplicates)
- Queue and flag gates pass
- Production schema still pre-migration for IG OAuth effects
- Deployments aligned with master `f4b5c35`

---

## Next approval required

1. Operator: `supabase login` + `supabase link` to production **or** provide approved read-only `DATABASE_URL`
2. Re-run **2E.6E** (or operator executes list + dry-run) and attach sanitized results
3. Confirm legacy `20260430` is `LEGACY_DUPLICATE_NON_BLOCKING` or `ALREADY_RECONCILED` via dry-run
4. Only then reissue **`GO MIGRATION WINDOW`**

---

## Scope confirmation

IG-AUTH-2E.6E production migration-readiness recheck only. No migration execution. No migration repair or history edits. No database/RPC/queue writes. No environment or feature-flag changes. No deployment. No provider calls or outbound messages. No canary. No merge performed.

---

## Required attestation

```text
Production authentication/link verification: NO
Production migration history read: NO
Dry-run performed: NO
Production migration executed: NONE
Migration repair executed: NONE
Manual migration-history edits: NONE
DDL executed: NONE
Database data writes: NONE
Queue mutations: NONE
Environment changes: NONE
Feature-flag changes: NONE
Deployments/restarts: NONE
Provider calls: NONE
Outbound messages: NONE
Canary: NONE
```
