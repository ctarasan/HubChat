# IG-AUTH-2E.5A Production Read-only Preflight

> **Agent:** A
> **Date:** 2026-06-19
> **Branch:** `docs/ig-auth-2e-5a-production-read-only-preflight`
> **Base master SHA:** `805e2605d97042b673750bdb108f325afca896f9`
> **Authorization:** `GO READ-ONLY PREFLIGHT`
> **Companion evidence:** [`ig-auth-2e-5-production-read-only-evidence.md`](../../instagram/ig-auth-2e-5-production-read-only-evidence.md)

---

## Summary

Authorized read-only production preflight executed against production Supabase (masked host `dsky?hyx.supabase.co`), Vercel Production, and Railway worker production. Aggregate queue/outbox counts, binding classification, OAuth flag name inventory, and PostgREST OpenAPI RPC introspection were captured. No writes, deploys, flag changes, or provider traffic occurred.

**Decision: HOLD** ? migration not applied, RPC binding parameter absent, zero production Instagram OAuth connections/credentials, recipient not ready, and deployed application code at `805e260` already requires the 16-argument RPC (APP-before-DB risk).

---

## Approval and scope

| Item | Status |
| --- | --- |
| Operator phrase | `GO READ-ONLY PREFLIGHT` |
| Prohibited actions | None performed |
| Source of truth docs | PR #255 runbook, PR #256 preflight SQL templates |
| Execution window (Asia/Bangkok) | 2026-06-19 14:14?14:21 |

---

## Master baseline

| Merge | SHA | Verified |
| --- | --- | --- |
| #255 controlled rollout runbook | `805e260` | On master HEAD |
| #256 production migration preflight | `c2a8761` | Ancestor of master |
| #254 worker/queue binding | `43b98fb` | Ancestor of master |

| Deploy surface | SHA | Notes |
| --- | --- | --- |
| Railway worker production | `805e260` | Deployment `3832bc46-?`, SUCCESS 14:01 +07 |
| Vercel Production | `805e260` (inferred) | Alias `smartkorp-hub-chat.vercel.app` updated 14:01 +07; same merge window as Railway |

---

## Production reads performed

| Query / check | Method | Sanitized output location |
| --- | --- | --- |
| Queue status counts | Supabase JS `count` head | Evidence ?Queue |
| Stale PROCESSING | `updated_at` cutoff 15 min | Evidence ?Queue |
| OAuth-bound job counts | JSON path `payload_json->instagramCredentialBinding->>mode` | Evidence ?Queue |
| Binding validity classification | Safe field inspection in JS | Evidence ?Binding |
| Outbox status counts | Supabase JS `count` | Evidence ?Queue |
| Dead-letter previews | `left(last_error, 120)` aggregate | Evidence ?Queue |
| Instagram connections / OAuth credentials | Row counts + status histogram | Evidence ?OAuth |
| RPC signature | PostgREST OpenAPI document search | Evidence ?RPC |
| Vercel OAuth flag names | `vercel env ls` + pulled env name scan | Evidence ?Flags |
| Railway OAuth flag names | `railway variables --json` name scan | Evidence ?Flags |

**Not performed:** `schema_migrations` SQL, `pg_proc` SQL (no direct Postgres session), Meta API, Test Connection provider traffic, outbound message send.

---

## Migration status

| Field | Value |
| --- | --- |
| Migration filename | `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Local migration SHA / version | `20260621120000` |
| **Production state** | **NOT_APPLIED** (OpenAPI: `p_instagram_credential_binding` absent) |
| `supabase migration list` | Not available (project not linked) |
| Direct `schema_migrations` | Not executed |

---

## RPC signatures

| Field | Value |
| --- | --- |
| RPC name | `create_outbound_message_with_outbox` |
| Overload count (observable) | 1 PostgREST path; pre-migration signature implied |
| Binding parameter in production API | **Absent** |
| **RPC ambiguity** | **RPC_NOT_MIGRATED** (not yet in overload-ambiguous state) |
| Post-migration requirement | Run `pg_proc` query from [`ig-auth-2e-4-production-migration-preflight.md`](../../instagram/ig-auth-2e-4-production-migration-preflight.md) ?1 |

---

## Schema compatibility

Deployed `supabaseOutboundCommandRepository` at `805e260` always supplies `p_instagram_credential_binding`. Production OpenAPI does not expose that parameter.

**Verdict:** Incompatible until migration applied and RPC verified.

---

## Queue / outbox / binding summary

| Metric | Value |
| --- | ---: |
| PENDING | 0 |
| PROCESSING | 0 |
| Stale PROCESSING | 0 |
| DEAD_LETTER | 39 |
| OAuth-bound jobs (active) | 0 |
| Malformed bindings | 0 |
| Unexpected pending OAuth jobs | 0 |
| Outbox DISPATCHED | 411 |
| Outbox PENDING | 0 |

---

## Feature flags

### Vercel Production

All five OAuth delivery flags: **ABSENT**

### Railway worker production

All five OAuth delivery flags: **ABSENT**
Legacy `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE`: **PRESENT** (not an OAuth delivery gate)

### Environment ownership (code-derived)

| Flag | Vercel | Railway | Enqueue gated? |
| --- | --- | --- | --- |
| FOUNDATION | API connect/test/resolver | Worker | No |
| RUNTIME | API connect/test/resolver | Worker | No |
| WORKER_ROUTING | No | Worker | No (worker process only) |
| OUTBOUND_TEXT | No | Worker | No |
| OUTBOUND_IMAGE | No | Worker | No |

---

## OAuth connection and recipient

| Check | Result |
| --- | --- |
| Instagram `channel_connections` | 0 |
| `instagram_oauth_credentials` | 0 |
| Masked canary connection | **None** |
| Credential lifecycle usable | **N/A** |
| Duplicate/ambiguity | **N/A** |
| **Recipient readiness** | **NOT_READY** |

---

## Deployment ordering and rollback

| Check | Verdict |
| --- | --- |
| APP_BEFORE_DB | **UNSAFE** (code at `805e260` + DB without binding RPC param per OpenAPI) |
| WORKER_BEFORE_DB | **UNSAFE** (same RPC coupling) |
| Recommended order | DB migration ? RPC verify ? deploy flags-OFF ? legacy smoke ? separate canary |

**Rollback with pending jobs:** `WORKER_ROUTING` OFF ? terminal configuration failure (`OAUTH_WORKER_ROUTING_DISABLED`), not retryable, no legacy fallback. Current OAuth-bound PENDING/PROCESSING: **0**.

---

## Legacy baseline

LINE / Facebook / legacy Instagram: no active backlog; stale processing 0; dead-letter dominated by historical Facebook token and permission errors. No new unexplained spike.

---

## Security / evidence sanitization

- No database URLs, service keys, JWTs, tokens, ciphertext, Authorization headers, or full env dumps recorded
- UUIDs and external IDs masked or omitted
- No `payload_json` body, message content, or full signed URLs selected
- Dead-letter evidence uses truncated `last_error` previews only
- Temporary pulled env file (`.env.ig2e5-preflight`) deleted after capture; not committed

---

## Completion report

```text
Branch: docs/ig-auth-2e-5a-production-read-only-preflight
Commit: 974c96db597dd4f5d0474029b89ca5bede1a8575
PR: (pending)
Base master SHA: 805e2605d97042b673750bdb108f325afca896f9
Production environment checked: Supabase prod (dsky?hyx), Vercel prod, Railway worker prod
Execution timestamp: 2026-06-19 14:17 +07 (primary capture)

Migration filename: 20260621120000_ig_auth_2e3_outbound_instagram_binding.sql
Production migration state: NOT_APPLIED (OpenAPI inference)
RPC signatures: pre-migration; binding param absent
RPC overload count: 1 observable PostgREST path
RPC ambiguity: RPC_NOT_MIGRATED

Queue baseline: acceptable (no active backlog)
Pending: 0
Processing: 0
Stale processing: 0
Dead letter: 39
OAuth-bound jobs: 0
Malformed bindings: 0
Unexpected pending OAuth jobs: 0

Vercel flag states: all five OAuth flags ABSENT
Railway flag states: all five OAuth flags ABSENT
Flag environment ownership: documented in evidence pack

OAuth connection readiness: NOT_READY (zero connections/credentials)
Masked connection: none
Credential lifecycle: N/A
Duplicate/ambiguity check: N/A
Recipient readiness: NOT_READY

App-before-DB safety: UNSAFE
Worker-before-DB safety: UNSAFE
Recommended deployment order: DB migration ? RPC verify ? deploy flags-OFF
Rollback pending-job behavior: terminal configuration failure, not retryable

Legacy baseline: acceptable
Security/evidence sanitization: pass

Production reads performed: yes (aggregate/select count only)
Production writes performed: 0
Environment changes: 0
Deployments: 0
Provider calls: 0
Outbound messages: 0

Blocking findings:
- Migration NOT_APPLIED (binding RPC param absent)
- RPC_NOT_MIGRATED
- Schema incompatible with deployed enqueue code
- Zero Instagram OAuth connections/credentials in production
- Recipient NOT_READY
- APP-before-DB exposure risk

Non-blocking notes:
- OAuth flags correctly ABSENT
- No malformed bindings or unexpected OAuth-bound jobs
- pg_proc / schema_migrations direct SQL deferred to migration window

Decision: HOLD
Next approval required: GO MIGRATION WINDOW (operator review), then GO DEPLOY FLAGS-OFF; canary separate

Scope confirmation:
IG-AUTH-2E.5A authorized production read-only preflight only.
No migration execution. No database/RPC/queue writes.
No environment or feature-flag changes. No deployment or restart.
No provider calls or outbound messages. No canary.
No private reply, webhook, profile enrichment, OAuth UI, refresh scheduler, or legacy retirement.
No merge performed.
```

---

## Next steps (deferred)

1. Operator + Agent B review evidence pack
2. On `GO MIGRATION WINDOW`: apply `20260621120000`, run `schema_migrations` + `pg_proc` queries
3. On `GO DEPLOY FLAGS-OFF`: confirm deploy SHAs with flags still ABSENT
4. Onboard production Instagram OAuth connection + controlled test recipient before `GO TEXT CANARY`
5. Re-run queue baseline after migration apply
