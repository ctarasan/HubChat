# IG-AUTH-2E.4 Production Migration Preflight

Operator-facing preflight for Instagram OAuth outbound controlled rollout. **Read-only** — do not execute writes from this document unless explicitly approved in a separate migration window.

**Master baseline:** `ad3b880` (PR #253 + #254 merged)  
**Migration file:** `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql`

---

## 1. RPC overload verification (required post-migration)

PostgreSQL treats a function with an additional parameter as a **new overload** unless the prior signature is dropped. After applying the 2E.3 migration, run:

```sql
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as full_arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_outbound_message_with_outbox'
order by identity_arguments;
```

**GO:** Exactly one row, or multiple rows where PostgREST unambiguously resolves the 16-argument signature when `p_instagram_credential_binding` is supplied.

**HOLD:** Two or more rows and PostgREST cannot disambiguate; or the 16-argument signature is missing.

Expected new identity tail: `..., integer, integer, jsonb` (final arg `p_instagram_credential_binding jsonb`).

---

## 2. Migration history (read-only)

```sql
select version, name
from supabase_migrations.schema_migrations
where version = '20260621120000'
   or name ilike '%ig_auth_2e3%outbound%instagram%binding%';
```

| Result | Status |
| --- | --- |
| Row present | `ALREADY_APPLIED` |
| No row | `NOT_APPLIED` |
| Partial / inconsistent | `PARTIALLY_APPLIED` |
| Cannot query | `UNKNOWN` |

---

## 3. Queue baseline (safe projections only)

Topic: `message.outbound.requested` (not `outbound`).

### Status counts

```sql
select status, count(*) as job_count
from queue_jobs
where topic = 'message.outbound.requested'
group by status
order by status;
```

### Stale PROCESSING (adjust interval to ops policy)

```sql
select count(*) as stale_processing_count
from queue_jobs
where topic = 'message.outbound.requested'
  and status = 'PROCESSING'
  and updated_at < now() - interval '15 minutes';
```

### Dead letter (recent codes only — no payload)

```sql
select
  left(coalesce(last_error, ''), 120) as error_preview,
  count(*) as job_count
from queue_jobs
where topic = 'message.outbound.requested'
  and status = 'DEAD_LETTER'
group by 1
order by job_count desc
limit 20;
```

### OAuth binding presence (safe JSON paths only)

```sql
select
  count(*) filter (where payload_json ? 'instagramCredentialBinding') as jobs_with_binding_key,
  count(*) filter (
    where payload_json->'instagramCredentialBinding'->>'mode' = 'CONNECTION_BOUND'
  ) as connection_bound_jobs,
  count(*) filter (
    where payload_json ? 'instagramCredentialBinding'
      and payload_json->'instagramCredentialBinding'->>'mode' is null
  ) as malformed_binding_jobs
from queue_jobs
where topic = 'message.outbound.requested'
  and status in ('PENDING', 'PROCESSING');
```

### Pending OAuth-bound jobs

```sql
select count(*) as oauth_bound_pending
from queue_jobs
where topic = 'message.outbound.requested'
  and status = 'PENDING'
  and payload_json->'instagramCredentialBinding'->>'mode' = 'CONNECTION_BOUND';
```

**Do not** `select payload_json`, `content`, tokens, or full URLs.

---

## 4. Outbox baseline (optional)

```sql
select status, count(*) as event_count
from outbox_events
where topic = 'message.outbound.requested'
group by status
order by status;
```

```sql
select count(*) as outbox_with_binding
from outbox_events
where topic = 'message.outbound.requested'
  and status = 'PENDING'
  and payload_json ? 'instagramCredentialBinding';
```

---

## 5. OAuth connection readiness (read-only)

```sql
select
  cc.id,
  cc.tenant_id,
  cc.provider,
  cc.status,
  left(coalesce(cc.provider_ig_account_id, ''), 4) || '…' || right(coalesce(cc.provider_ig_account_id, ''), 4) as ig_account_masked,
  ioc.credential_status,
  ioc.auth_family,
  left(coalesce(ioc.provider_instagram_account_id, ''), 4) || '…' || right(coalesce(ioc.provider_instagram_account_id, ''), 4) as oauth_account_masked
from channel_connections cc
left join instagram_oauth_credentials ioc
  on ioc.channel_connection_id = cc.id
  and ioc.tenant_id = cc.tenant_id
where cc.provider = 'INSTAGRAM'
  and cc.status in ('READY', 'OUTBOUND_VERIFIED', 'INBOUND_VERIFIED', 'WEBHOOK_VERIFIED')
order by cc.updated_at desc
limit 20;
```

Mask full UUIDs in operator notes (e.g. `cc111111-…-111111`).

Verify per canary candidate:

- `auth_family = INSTAGRAM_BUSINESS_LOGIN`
- `credential_status` in (`ACTIVE`, `TOKEN_EXPIRING`)
- Exactly one active credential per connection
- Conversation has non-null `channel_connection_id` pointing to this connection

---

## 6. Safe deployment order

| Step | Action |
| --- | --- |
| 1 | Backup / recovery checkpoint |
| 2 | Apply additive migration `20260621120000` |
| 3 | Run RPC overload query (§1) |
| 4 | Deploy Vercel + Railway at target SHA with **all OAuth flags OFF/absent** |
| 5 | Verify legacy LINE / Facebook / Instagram outbound smoke |
| 6 | Confirm zero unexpected `CONNECTION_BOUND` pending jobs |
| 7 | Separate approved canary phase (2E.4B+) |

### Ordering rules (code-derived)

| Order | Safety |
| --- | --- |
| **DB migration → app/worker deploy** | **SAFE** — new RPC param exists before repository sends `p_instagram_credential_binding` |
| **App/worker deploy → DB migration** | **UNSAFE** — `SupabaseOutboundCommandRepository` always passes `p_instagram_credential_binding`; old RPC signature will reject the call and **all outbound enqueue fails** |
| **Worker deploy → DB migration** | **UNSAFE** if app already deployed (same RPC issue) |
| **Worker-only deploy after DB** | **SAFE** for legacy jobs; OAuth routing remains OFF until flags enabled |

---

## 7. Feature-flag expected state (preflight)

All must be **ABSENT** or explicit **false** (not `true`):

- `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED`
- `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED`
- `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED`
- `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED`
- `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED`

Check Vercel Production and Railway Worker variable **names only** — never record values.

---

## 8. Rollback notes

Disabling `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` does **not** remove bindings from queued jobs. Worker behavior for `OAUTH_INSTAGRAM_JOB` with routing OFF:

- `markFailed` (terminal configuration)
- `idempotency.markProcessed`
- `TerminalOutboundDeliveryError` — **not retryable**, no legacy fallback

**Before disabling routing in production:** ensure zero pending/in-flight `CONNECTION_BOUND` jobs, or accept terminal failure of those jobs.

Additive DB migration should remain in place; rollback is flag-off + queue drain, not schema revert.

---

## 9. Future canary prerequisites (not executed here)

- One approved OAuth-managed Instagram connection with `channel_connection_id` on test conversation
- One operator-approved test recipient IGSID
- Text message first; image only after text PASS
- One job at a time
- All five OAuth gates ON for the relevant path
- No private reply, no production customer without approval
