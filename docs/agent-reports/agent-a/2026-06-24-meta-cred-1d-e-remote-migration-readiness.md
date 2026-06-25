# META-CRED-1D-E — Remote Migration Readiness Review

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-24 (initial); linked completion **2026-06-25** (META-CRED-1D-E-R) |
| Phase | META-CRED-1D-E / **META-CRED-1D-E-R** (read-only / dry-run readiness review) |
| Authorization | `GO REMOTE MIGRATION READINESS REVIEW`; linked completion **`GO COMPLETE LINKED REMOTE READINESS CHECKS`** |
| Master SHA | `8f09a256571c129c1dc14de29886638a456b6b72` |
| Branch | `docs/meta-cred-1d-e-remote-migration-readiness` |
| Commit SHA | `78ee937f684eb36ce231a99f47e6eee2945cd224` |
| PR | [#288](https://github.com/ctarasan/HubChat/pull/288) |
| Supabase CLI | `2.98.2` |
| Linked project (intended production) | SmartKorp Hub Chat — ref `dsky…hyx` (full ref verified via `supabase projects list`; name + region match) |
| Linked locally (Agent A) | **YES** — `supabase link --project-ref dsky…hyx` completed 2026-06-25 |
| Linked locally (Agent B) | **NO** — out of scope for this task |

## Executive summary

Local migration inventory, static SQL safety, dependency ordering, and runtime compatibility while the activation flag remains OFF all **pass**. Initial review (1D-E) was **HOLD** pending Supabase link. **META-CRED-1D-E-R** completed linked remote migration inventory, dry-run, and read-only schema precondition queries on SmartKorp Hub Chat production — all **pass**.

**Decision: READY FOR META-CRED-1D-E-B INDEPENDENT MIGRATION READINESS REVIEW** — no real migration executed; operational hold on execution/cutover remains.

---

## 1. Master sync

| Check | Result |
| --- | --- |
| `HEAD` | `8f09a256571c129c1dc14de29886638a456b6b72` |
| `origin/master` | `8f09a256571c129c1dc14de29886638a456b6b72` |
| Working tree clean | YES |

---

## 2. Local migration-history audit

| Item | Result |
| --- | --- |
| Local migration count | **28** `.sql` files under `supabase/migrations` |
| Duplicate 14-digit version prefixes | **NONE** (`supabaseMigrationVersionUniqueness.test.ts` 12/12 PASS) |
| Invalid timestamp prefixes | **NONE** (all parseable UTC 14-digit or legacy `20260430` canonical exception) |
| Existing migration renamed | **NO** (legacy `20260430` data path preserved as `20260501120000`; reconciliation at `20260621150000`) |
| Existing migration content rewritten unexpectedly | **NO** (hash-locked tests for legacy `20260430` paths PASS) |
| META-CRED ordering | **YES** — `20260623120000` (1C) immediately before `20260624120000` (1D-B) |
| Unexpected later migrations after META-CRED | **NONE** — 1C/1D are the tip of local history |

META-CRED files:

```text
20260623120000_meta_cred_1c_shared_meta_page_credentials.sql
20260624120000_meta_cred_1d_activation_rpc.sql
```

Repository migration tests run:

| Suite | Result |
| --- | --- |
| `supabaseMigrationVersionUniqueness.test.ts` | 12/12 PASS |
| `metaPageCredentialMigration.test.ts` (1C) | PASS |
| `metaPageCredentialActivationMigration.test.ts` (1D-B) | PASS |

---

## 3. Remote migration-history inventory

**Status: EXECUTED** — `supabase migration list --linked` (UTC 2026-06-25; CLI `2.98.2`).

Sanitized summary: **26** local/remote version pairs aligned through `20260621150000`; **2** local-only rows (remote column blank) at tip.

| Local | Remote | State |
| --- | --- | --- |
| `20260621150000` | `20260621150000` | applied |
| `20260623120000` | _(blank)_ | **PENDING** |
| `20260624120000` | _(blank)_ | **PENDING** |

| Question | Answer |
| --- | --- |
| Remote/local history aligned before META-CRED | **YES** (through `20260621150000`) |
| `20260623120000` | **PENDING** |
| `20260624120000` | **PENDING** |
| Unexpected pending migrations | **NONE** |
| Remote-only versions | **NONE** |
| Divergence | **NONE** |

No `migration repair` executed.

---

## 4. Linked dry-run

**Status: EXECUTED** — single dry-run only.

| Item | Result |
| --- | --- |
| Command | `supabase db push --linked --dry-run` |
| CLI version | `2.98.2` |
| Exit code | **0** |
| Proposed versions | `20260623120000_meta_cred_1c_shared_meta_page_credentials.sql`, `20260624120000_meta_cred_1d_activation_rpc.sql` |
| Interactive execute prompt | **NO** (`DRY RUN: migrations will *not* be pushed`) |
| Warnings/errors | CLI upgrade notice only (v2.107.0 available) |

Exact proposed version set matches expected:

```text
20260623120000
20260624120000
```

No real `supabase db push --linked` executed.

---

## 5. Static SQL safety review

### 1C foundation (`20260623120000`)

| Check | Result |
| --- | --- |
| Additive tables only | YES — `meta_page_credentials`, `meta_page_credential_bindings` |
| Tenant-safe composite FKs | YES — `(tenant_id, id)` on connections; binding FKs scoped |
| Credential-family constraint | YES — `META_PAGE_FACEBOOK_LOGIN` only |
| Partial unique constraints | YES — one ACTIVE credential per tenant; one ACTIVE binding per connection |
| RLS enabled | YES — both new tables |
| Service-role posture | YES — RLS on; no broad grants added in migration |
| Destructive alteration of current credential storage | NO — does not touch `channel_settings.secret_json`, `channel_credentials`, or `instagram_oauth_credentials` |
| Legacy data migration | NO |
| Plaintext credential copy | NO |

Migration-time destructive patterns (`DROP TABLE`, `TRUNCATE`, `DELETE FROM`, legacy row `UPDATE`): **NONE**.

### 1D activation (`20260624120000`)

| Check | Result |
| --- | --- |
| Additive metadata columns | YES — `granted_scopes`, `token_expires_at`, `data_access_expires_at`, `provider_token_type`, `verification_version` |
| Idempotency table | YES — `meta_page_credential_activation_requests` |
| `activate_meta_page_credential_tx` | YES |
| `SECURITY DEFINER` | YES |
| `search_path` | `public, pg_temp` |
| Execute revokes | YES — PUBLIC, anon, authenticated |
| Service-role grant | YES — execute only |
| Ciphertext-only RPC params | YES — `p_encrypted_access_token`; no plaintext token param |
| `READY` mutation | NO |
| Rotation RPC | NO |
| Legacy credential import | NO |

**Classified matches:**

| Pattern | Location | Classification |
| --- | --- | --- |
| `drop constraint if exists` | 1D metadata checks | **Safe** — idempotent constraint replace on new 1C table; no column drop |
| `update` inside RPC body | 1D function | **Safe** — runtime activation logic, not migration-time DML |
| `-- drop function/table` comments | 1D rollback notes | **Comment only** — not executed |

Migration-time destructive patterns: **NONE**.

---

## 6. Dependency and ordering review

```text
1C enums + tables + indexes + RLS
  → 1D metadata columns + idempotency table + activation RPC
```

| Check | Result |
| --- | --- |
| 1D safe before 1C | **NO** — references `meta_page_credentials`, `meta_page_credential_bindings`, `channel_connections` |
| Normal ordering guarantees 1C first | YES — version `20260623120000` < `20260624120000` |
| RPC references only 1C/1D or pre-existing schema | YES |
| Missing enum/table dependency | NO |
| Function-name collision risk | LOW — new function name `activate_meta_page_credential_tx` |
| Incompatible silent replace | NO — `create or replace` on new function only |

Expected RPC signature (for post-migration verification):

```text
public.activate_meta_page_credential_tx(
  uuid, text, text, text, text, text, text, text, text, text[],
  timestamptz, timestamptz, text, integer, timestamptz, integer,
  uuid, uuid, uuid, text[]
) returns jsonb
```

---

## 7. Read-only remote precondition checks

**Status: EXECUTED** — read-only `supabase db query --linked` wrapped in `begin; set transaction read only; …; rollback;` (UTC 2026-06-25).

| Object | Exists |
| --- | --- |
| `public.meta_page_credentials` | **NO** |
| `public.meta_page_credential_bindings` | **NO** |
| `public.meta_page_credential_activation_requests` | **NO** |
| `public.activate_meta_page_credential_tx` | **NO** |
| 1D metadata columns on `meta_page_credentials` | **0** of 5 (`granted_scopes`, `token_expires_at`, `data_access_expires_at`, `provider_token_type`, `verification_version`) |

| Check | Result |
| --- | --- |
| Partial META-CRED schema state | **NO** — complete set absent |
| Migration history vs schema | **CONSISTENT** — pending history + absent objects |

No credential rows, token values, or customer data queried.

---

## 8. Runtime compatibility while unapplied

| Check | Result |
| --- | --- |
| Activation flag default OFF | YES — `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` absent/invalid = disabled |
| Route makes no provider/DB calls while OFF | YES — returns 503 `META_ACTIVATION_DISABLED` before auth/bootstrap |
| Facebook legacy runtime | unchanged |
| Instagram legacy/OAuth runtime | unchanged |
| LINE | unchanged |
| Worker/resolver imports activation adapter | NO (wiring tests PASS) |
| Production requires new schema while flag OFF | **NO** |

---

## 9. Post-migration verification plan (prepare only — do not execute)

Future separately authorized execution window should run:

1. `supabase migration list --linked` — confirm `20260623120000` and `20260624120000` applied; pending = 0
2. Read-only existence checks:
   - tables: `meta_page_credentials`, `meta_page_credential_bindings`, `meta_page_credential_activation_requests`
   - columns: `granted_scopes`, `token_expires_at`, `data_access_expires_at`, `provider_token_type`, `verification_version`
   - function: `to_regprocedure('public.activate_meta_page_credential_tx(uuid,text,text,text,text,text,text,text,text,text[],timestamptz,timestamptz,text,integer,timestamptz,integer,uuid,uuid,uuid,text[])')`
3. Grant audit: `has_function_privilege('service_role', …, 'EXECUTE')` = true; anon/authenticated = false
4. Confirm no plaintext-token parameter in `pg_proc` argument list
5. Confirm `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` remains OFF/absent in deployment
6. Channel runtime smoke: Facebook inbound, Instagram inbound, LINE inbound (baseline)
7. Ops runtime: queue/outbox pending + dead-letter baseline unchanged
8. **Stop criteria:** unexpected migration versions, partial schema, RPC grant widening, activation flag enabled without separate gate, channel smoke regression

No destructive rollback SQL prepared in this phase.

---

## 10. Carry-forward review notes

| Note | Blocking for migration execution? |
| --- | --- |
| SQL atomicity has contract/code review but no live-Postgres integration test | **NO** — acceptable with transactional RPC + code review |
| Concurrent first idempotency insert race → generic sanitized error | **NO** |
| `FAILED` activation-request enum unused | **NO** |
| `granted_scopes` normalization adapter-side | **NO** |
| `schema.sql` does not mirror RPC function body | **NO** — execution uses migration SQL |

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Remote migration (`db push` without `--dry-run`) | NO |
| Migration repair | NO |
| Remote SQL write | NO |
| Credential write/import | NO |
| Feature flag enablement | NO |
| Resolver cutover | NO |
| Outbound operation | NO |

---

## META-CRED-1D-E REMOTE MIGRATION READINESS RESULT

```text
META-CRED-1D-E REMOTE MIGRATION READINESS RESULT

Master SHA: 8f09a256571c129c1dc14de29886638a456b6b72
Supabase CLI version: 2.98.2
Linked project verified: YES (SmartKorp Hub Chat, ref dsky…hyx)
Working tree clean: YES (docs branch; evidence-only change pending commit)

Local history:
- Migration count: 28
- Duplicate versions: NONE
- Invalid versions: NONE
- Existing history rewritten: NO
- META-CRED ordering: 1C then 1D (tip of history)
- Unexpected later migrations: NONE

Remote history:
- Local/remote aligned: YES (through 20260621150000)
- 20260623120000: PENDING
- 20260624120000: PENDING
- Unexpected pending: NONE
- Remote-only versions: NONE
- Divergence: NONE

Dry-run:
- Command: supabase db push --linked --dry-run
- Exit code: 0
- Proposed versions: 20260623120000, 20260624120000
- Unexpected versions: NONE
- Interactive execute prompt: NO
- Warnings/errors: CLI upgrade notice only

Static SQL:
- 1C additive: YES
- 1D additive: YES
- Destructive SQL: NONE (migration-time)
- Legacy data mutation: NO
- Ciphertext-only RPC: YES
- SECURITY DEFINER safety: YES
- Execute grants: service_role only
- READY mutation: NO
- Rotation bundled: NO

Remote preconditions:
- Partial META-CRED objects: NO
- Tables absent/present: all absent (expected)
- Function absent/present: absent (expected)
- Metadata columns absent/present: 0/5 (expected)
- Migration history/schema consistent: YES

Runtime compatibility:
- Activation flag OFF: YES (code default)
- New schema required while OFF: NO
- Resolver/worker wiring: NO
- Current channel runtime affected: NO

Carry-forward notes:
- Live-Postgres test gap: non-blocking
- Idempotency race mapping: non-blocking
- FAILED state unused: non-blocking
- Scope normalization: non-blocking
- schema.sql RPC mirror: non-blocking
- Blocking for migration execution: NONE

Remote migration executed: NO
Migration repair executed: NO
Credential changed: NO
Feature flag enabled: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: READY FOR META-CRED-1D-E-B INDEPENDENT MIGRATION READINESS REVIEW

Recommended next gate: META-CRED-1D-E-B INDEPENDENT MIGRATION READINESS REVIEW

Operational state: HOLD — NO REAL DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```

---

## META-CRED-1D-E-R LINKED READINESS COMPLETION RESULT

```text
META-CRED-1D-E-R LINKED READINESS COMPLETION RESULT

Master SHA: 8f09a256571c129c1dc14de29886638a456b6b72
Branch: docs/meta-cred-1d-e-remote-migration-readiness
Final commit SHA: _filled at commit_
PR #288: https://github.com/ctarasan/HubChat/pull/288
Supabase CLI version: 2.98.2
Production project identity confirmed: YES (SmartKorp Hub Chat, South Asia Mumbai, ref dsky…hyx)
Repository linked: YES (Agent A only)

Remote migration history:
- Local/remote aligned: YES
- 20260623120000: PENDING
- 20260624120000: PENDING
- Unexpected pending: NONE
- Remote-only: NONE
- Divergence: NONE

Dry-run:
- Command: supabase db push --linked --dry-run
- Exit code: 0
- Proposed versions: 20260623120000, 20260624120000
- Exact expected set: MATCH
- Unexpected versions: NONE
- Interactive execution prompt: NO
- Warnings/errors: CLI upgrade notice only

Remote schema preconditions:
- meta_page_credentials: ABSENT
- meta_page_credential_bindings: ABSENT
- activation_requests: ABSENT
- activation RPC: ABSENT
- Metadata columns: ABSENT (0/5)
- Partial schema state: NO
- History/schema consistent: YES

Runtime safety:
- Activation flag OFF: YES (default/absent)
- New schema required while OFF: NO
- Provider/RPC calls while OFF: NO (503 before auth/bootstrap)
- Resolver/worker cutover: NO

Files changed:
- Evidence only: YES
- Migration changed: NO
- Code/config/ENV changed: NO

Real migration executed: NO
Migration repair executed: NO
Credential changed: NO
Feature flag enabled: NO
Resolver cutover executed: NO
Legacy cleanup executed: NO
Outbound operation executed: NO

Decision: READY FOR META-CRED-1D-E-B INDEPENDENT MIGRATION READINESS REVIEW

Recommended next gate: META-CRED-1D-E-B INDEPENDENT MIGRATION READINESS REVIEW

Operational state: HOLD — NO REAL DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
