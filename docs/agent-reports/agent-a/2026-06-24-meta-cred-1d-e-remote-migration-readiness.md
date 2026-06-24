# META-CRED-1D-E — Remote Migration Readiness Review

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-24 |
| Phase | META-CRED-1D-E (read-only / dry-run readiness review) |
| Authorization | `GO REMOTE MIGRATION READINESS REVIEW` |
| Master SHA | `8f09a256571c129c1dc14de29886638a456b6b72` |
| Branch | `docs/meta-cred-1d-e-remote-migration-readiness` |
| Commit SHA | `78ee937f684eb36ce231a99f47e6eee2945cd224` |
| PR | [#288](https://github.com/ctarasan/HubChat/pull/288) |
| Supabase CLI | `2.98.2` |
| Linked project (intended production) | SmartKorp Hub Chat — ref `dsky…hyx` (sanitized; from prior approved production evidence) |
| Linked locally (Agent A/B) | **NO** — `supabase link` not configured in either worktree |

## Executive summary

Local migration inventory, static SQL safety, dependency ordering, and runtime compatibility while the activation flag remains OFF all **pass**. Remote migration-history inventory, linked dry-run, and read-only remote schema precondition queries **could not be executed** because the Supabase CLI project link and database admin path are unavailable on the Agent A machine at review time.

**Decision: HOLD** — unblock with operator `supabase login` + `supabase link` to production (or approved read-only `DATABASE_URL`), then re-run sections 3–4 and 7 before authorizing execution.

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

**Status: NOT EXECUTED** — `supabase migration list --linked` failed:

```text
Cannot find project ref. Have you run supabase link?
```

| Check | Result |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` present | NO |
| `DATABASE_URL` present | NO |
| Agent A `supabase/.temp/project-ref` | absent |
| Agent B project ref | absent |

### Expected state (inference only — not verified)

If remote production matches post–IG-AUTH-2E.7C execution (last documented real push through `20260621150000`), the **expected** META-CRED pending set is:

```text
20260623120000
20260624120000
```

This inference is **not certified** without a fresh `migration list --linked`.

| Question | Answer |
| --- | --- |
| Remote/local history aligned before META-CRED | **UNKNOWN** |
| `20260623120000` pending | **UNKNOWN** (expected YES if 2E.7C tip holds) |
| `20260624120000` pending | **UNKNOWN** (expected YES if 2E.7C tip holds) |
| Unexpected pending migrations | **UNKNOWN** |
| Remote-only versions | **UNKNOWN** |
| Divergence | **UNKNOWN** |

**Blocking HOLD:** remote history must be read before execution authorization.

---

## 4. Linked dry-run

**Status: NOT EXECUTED** — same link failure as section 3.

| Item | Result |
| --- | --- |
| Command attempted | `supabase db push --linked --dry-run` |
| Exit code | failure (no project ref) |
| Proposed versions | **N/A** |
| Interactive execute prompt | **N/A** |
| Warnings/errors | `Cannot find project ref. Have you run supabase link?` |

**Do not retry** until link is restored. When unblocked, dry-run **must** propose exactly:

```text
20260623120000
20260624120000
```

Any other version set → `HOLD — UNEXPECTED MIGRATION SET`.

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

**Status: NOT EXECUTED** — no approved read-only DB connection available.

Expected before first execution (if migration history is clean):

```text
meta_page_credentials: absent
meta_page_credential_bindings: absent
meta_page_credential_activation_requests: absent
activate_meta_page_credential_tx: absent
1D metadata columns: absent
```

If partial objects exist while history shows pending → `HOLD — PARTIAL REMOTE SCHEMA STATE`.

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
Linked project verified: NO (link not configured locally)
Working tree clean: YES (docs branch)

Local history:
- Migration count: 28
- Duplicate versions: NONE
- Invalid versions: NONE
- Existing history rewritten: NO
- META-CRED ordering: 1C then 1D (tip of history)
- Unexpected later migrations: NONE

Remote history:
- Local/remote aligned: UNKNOWN (not read)
- 20260623120000: UNKNOWN (expected pending if post-2E.7C)
- 20260624120000: UNKNOWN (expected pending if post-2E.7C)
- Unexpected pending: UNKNOWN
- Remote-only versions: UNKNOWN
- Divergence: UNKNOWN

Dry-run:
- Command: supabase db push --linked --dry-run
- Exit code: failure (no project ref)
- Proposed versions: N/A
- Unexpected versions: N/A
- Interactive execute prompt: N/A
- Warnings/errors: Cannot find project ref

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
- Partial META-CRED objects: UNKNOWN (not queried)
- Tables absent/present: UNKNOWN
- Function absent/present: UNKNOWN
- Metadata columns absent/present: UNKNOWN
- Migration history/schema consistent: UNKNOWN

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
- Blocking for migration execution: PRODUCTION_DB_LINK_UNAVAILABLE

Remote migration executed: NO
Migration repair executed: NO
Credential changed: NO
Feature flag enabled: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: HOLD

Recommended next gate:
1. Operator: supabase login + supabase link to SmartKorp Hub Chat production (dsky…hyx)
2. Read-only: supabase migration list --linked
3. Read-only: supabase db push --linked --dry-run (must propose exactly 20260623120000 + 20260624120000)
4. Read-only remote schema existence checks (section 7)
5. META-CRED-1D-E-B INDEPENDENT MIGRATION READINESS REVIEW

Operational state: HOLD — NO REAL DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
