# IG-AUTH-2E.5 Production Read-only Evidence

Sanitized production evidence captured under operator approval `GO READ-ONLY PREFLIGHT`. No writes, deploys, flag changes, provider calls, or outbound messages were performed.

---

## Approval

| Field | Value |
| --- | --- |
| Authorization phrase | `GO READ-ONLY PREFLIGHT` |
| Not authorized | `GO MIGRATION WINDOW`, `GO DEPLOY FLAGS-OFF`, `GO TEXT CANARY`, `GO IMAGE CANARY` |
| Evidence capture window (Asia/Bangkok) | 2026-06-19 14:14–14:21 |
| Prior baseline | IG-AUTH-2E.4 COMPLETE; production decision HOLD |

---

## Scope and prohibitions

All hard prohibitions observed:

- No migration execution, DDL, DML, RPC mutation, queue/outbox mutation
- No message send, Meta API call, OAuth Test Connection provider traffic
- No environment edit, feature-flag change, Vercel/Railway redeploy or restart
- No credential rotation, secret reveal, canary, private reply, legacy retirement, merge

Production target confirmed via masked host `dsky…hyx.supabase.co` (matches operator production Supabase project). Commands used aggregate counts, safe JSON path filters, truncated `last_error` previews, and PostgREST OpenAPI introspection only.

---

## Master/deployment baseline

| Item | Value |
| --- | --- |
| Master SHA | `805e2605d97042b673750bdb108f325afca896f9` |
| PR #255 | Present on master (`805e260`) — controlled rollout runbook |
| PR #256 | Present on master (`c2a8761` ancestor) — production migration preflight |
| PR #254 (2E.3 implementation) | Present on master (`43b98fb` ancestor) |
| Vercel Production alias | `smartkorp-hub-chat.vercel.app` |
| Vercel Production deploy | Ready; alias updated 2026-06-19 14:01 +07 |
| Railway worker production | `805e260` (`3832bc46-…` deployment, SUCCESS 2026-06-19 14:01 +07) |
| Evidence branch | `docs/ig-auth-2e-5a-production-read-only-preflight` |

---

## Migration status

| Field | Value |
| --- | --- |
| Migration filename | `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Local migration version | `20260621120000` |
| `supabase migration list` | Not available (project not linked locally) |
| `schema_migrations` direct SQL | Not executed (no `DATABASE_URL` / direct Postgres session in operator env) |
| PostgREST OpenAPI inference | `p_instagram_credential_binding` **absent** (0 occurrences in OpenAPI document) |
| **Production migration state** | **NOT_APPLIED** (inferred from OpenAPI; direct history row not confirmed) |

**Implication:** Until `schema_migrations` and `pg_proc` are confirmed in the migration window, treat state as **NOT_APPLIED**. `NOT_APPLIED` + deployed app code at `805e260` that always RPC-calls `p_instagram_credential_binding` is an **APP-before-DB exposure risk** (see Deployment ordering).

---

## RPC signatures and ambiguity

| Query / method | Timestamp (+07) | Result |
| --- | --- | --- |
| PostgREST OpenAPI `GET /rest/v1/` | 2026-06-19 14:20 | `create_outbound_message_with_outbox` present; `p_instagram_credential_binding` **not** exposed |
| `pg_proc` overload query (§1 preflight doc) | Not executed | Requires direct Postgres read session |

| Field | Value |
| --- | --- |
| RPC overload count (observable) | 1 PostgREST RPC path; pre-migration 15-parameter signature implied |
| Old signature present | **Yes** (binding param absent from OpenAPI) |
| New optional binding parameter present | **No** |
| PostgREST ambiguity risk | **Low while binding param absent**; overload ambiguity must be re-checked immediately after migration apply |
| SECURITY DEFINER | Not verified (requires `pg_proc` query) |
| **RPC decision** | **RPC_NOT_MIGRATED** |

---

## Schema compatibility

Code at `805e260` (`supabaseOutboundCommandRepository.ts`) **always** passes `p_instagram_credential_binding` (`null` or safe JSON). Production OpenAPI does not expose the 16-parameter signature.

| Check | Production state |
| --- | --- |
| RPC accepts Instagram credential binding parameter | **No** (not in OpenAPI) |
| Outbox can persist `instagramCredentialBinding` | **Not verified post-migration**; migration not applied |
| Legacy callers compatible after migration | Expected yes (param defaults `null`) per merged migration |
| Missing required column/function for 2E.3 code | **Binding RPC parameter missing** |

**Schema compatibility verdict:** **Incompatible** with deployed application code until migration `20260621120000` is applied and RPC verified.

---

## Queue/outbox baseline

Topic: `message.outbound.requested`

### Queue jobs (aggregate)

| Metric | Count | Captured (+07) |
| --- | ---: | --- |
| PENDING | 0 | 2026-06-19 14:17 |
| PROCESSING | 0 | 2026-06-19 14:17 |
| DONE | 391 | 2026-06-19 14:17 |
| DEAD_LETTER | 39 | 2026-06-19 14:17 |
| Stale PROCESSING (>15 min) | 0 | 2026-06-19 14:17 |
| OAuth-bound PENDING (`CONNECTION_BOUND`) | 0 | 2026-06-19 14:17 |
| OAuth-bound PROCESSING | 0 | 2026-06-19 14:17 |
| OAuth-bound DEAD_LETTER | 0 | 2026-06-19 14:17 |
| Jobs with binding key (PENDING/PROCESSING) | 0 | 2026-06-19 14:17 |

### Dead-letter previews (truncated `last_error`, top codes)

| error_preview (≤120 chars) | job_count |
| --- | ---: |
| RetryableOutboundDeliveryError: Error validating access token: Session has expired… | 11 |
| RetryableOutboundDeliveryError: Facebook temporary API error http=500… | 7 |
| ChannelConnectRuntimeResolverError: FACEBOOK OAuth credentials are unavailable… | 7 |
| Error: Facebook Comment Reply API error: permission pages_read_user_content… | 5 |
| Error: Facebook Send API failed (400): Error validating access token… | 3 |
| Other token/session errors (≤2 each) | 6 |

No OAuth-worker routing codes observed in dead-letter previews.

### Outbox events (aggregate)

| Status | Count |
| --- | ---: |
| PENDING | 0 |
| PROCESSING | 0 |
| DISPATCHED | 411 |
| DEAD_LETTER | 0 |
| PENDING with `instagramCredentialBinding` key | 0 |

### Legacy channel sample (completed jobs in last 1000 per status bucket)

| Channel | DONE | DEAD_LETTER |
| --- | ---: | ---: |
| LINE | 150 | 0 |
| FACEBOOK | 154 | 22 |
| INSTAGRAM (legacy path) | 87 | 17 |

---

## Binding validity

Classification over queue rows in `PENDING`, `PROCESSING`, `DEAD_LETTER` with `instagramCredentialBinding` key (sample cap 500):

| Class | Count |
| --- | ---: |
| VALID_CONNECTION_BOUND | 0 |
| EXPLICIT_LEGACY | 0 |
| MALFORMED | 0 |
| UNKNOWN_VERSION | 0 |
| All other defect classes | 0 |
| Rows sampled | 0 |

**Malformed / unknown-version gate:** PASS (zero rows with binding key in active statuses).

---

## Pending/in-flight OAuth jobs

| Question | Answer |
| --- | --- |
| OAuth-bound PENDING | **0** |
| OAuth-bound PROCESSING | **0** |
| OAuth-bound DEAD_LETTER | **0** |
| Retryable/requeued OAuth-bound | **0** observed |
| Unexpected OAuth-bound jobs | **None** |

Expected pre-rollout state met for queue binding jobs.

---

## Feature-flag inventory

Names only; values not recorded.

### Vercel Production (`vercel env ls` + pulled name check)

| Flag | State |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | **ABSENT** |

### Railway worker production (`railway variables --json`, names only)

| Flag | State |
| --- | --- |
| All five OAuth flags above | **ABSENT** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **PRESENT** (legacy Instagram runtime label; not an OAuth delivery gate) |

Preflight-safe expected state met: all delivery-affecting OAuth flags **ABSENT**.

---

## Environment ownership

| Flag | Vercel app/API | Railway worker | Effect |
| --- | --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | Connect/test/resolver API paths | Worker foundation gate | Required for OAuth runtime on worker |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | Connect/test/resolver API paths | Worker runtime gate | Required for OAuth runtime on worker |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | No | **Yes** | Routes `CONNECTION_BOUND` jobs to OAuth worker path |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | No | **Yes** | OAuth text provider send |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | No | **Yes** | OAuth image provider send |

**Enqueue path:** `resolveInstagramOutboundEnqueueBinding` is **not** flag-gated; binding is derived from trusted DB state at enqueue time. Repository always sends RPC binding argument.

---

## OAuth connection readiness

| Check | Result |
| --- | --- |
| `channel_connections` where `provider = INSTAGRAM` | **0 rows** |
| `instagram_oauth_credentials` rows | **0 rows** |
| Canary connection nominated | **None** |
| `INSTAGRAM_BUSINESS_LOGIN` + `DATABASE_ONLY` credential | **Not present** |
| Professional account ID present | **N/A** |
| Duplicate/ambiguous active credential | **N/A** (no credentials) |

**OAuth connection readiness:** **NOT_READY**

---

## Recipient readiness

| Check | Result |
| --- | --- |
| Conversation bound to OAuth connection | **No OAuth connection exists** |
| `ig:user:{IGSID}` DM thread on OAuth connection | **None found** |
| Controlled/test recipient identified | **No** |
| Private-reply-only thread risk | **Not assessed** (no OAuth connection) |

**Recipient readiness:** **NOT_READY**

---

## Deployment ordering

Current production deploy SHA `805e260` includes PR #254 repository code that **always** passes `p_instagram_credential_binding`. Production OpenAPI indicates migration **NOT_APPLIED**.

| Check | Verdict |
| --- | --- |
| APP_BEFORE_DB (app deployed with binding RPC call, DB without 16-arg signature) | **UNSAFE** (observed configuration) |
| WORKER_BEFORE_DB (worker at same SHA, DB without migration) | **UNSAFE** (same RPC dependency if app enqueues) |
| **RECOMMENDED_ORDER** | 1) Apply migration `20260621120000` → 2) Verify `pg_proc` unambiguous → 3) Deploy Vercel + Railway with all OAuth flags OFF/ABSENT → 4) Legacy regression → 5) Separate canary approval |

Queue shows `PENDING=0` at capture time; this does not disprove APP-before-DB risk for the next enqueue attempt.

---

## Rollback safety

When `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` transitions ON → OFF, `CONNECTION_BOUND` jobs processed by the worker hit `failInstagramOAuthOutboundConfiguration` → `markFailed` → `idempotency.markProcessed` → `TerminalOutboundDeliveryError` (**not retryable**, no legacy fallback).

| Job status at flag-off | Expected behavior |
| --- | --- |
| PENDING | Remains pending until claimed; on process → **terminal configuration failure** |
| PROCESSING | On completion attempt → **terminal configuration failure** |
| REQUEUED / retryable | Returns to worker; routing gate → **terminal configuration failure** (not legacy fallback) |

**Rollback precondition:** No unsafe OAuth-bound PENDING/PROCESSING jobs before disabling worker routing. Current counts: **0** (pass).

---

## Legacy baseline

| Signal | Assessment |
| --- | --- |
| LINE queue | No active backlog; historical DONE sample normal |
| Facebook queue | No active backlog; DLQ dominated by known token/API errors |
| Legacy Instagram queue | No active backlog; DLQ count stable in sample |
| Stale PROCESSING increase | **None** (0) |
| New unexplained DLQ spike | **None** observed vs historical token/permission errors |

Legacy baseline acceptable for pre-migration window planning.

---

## Risks and blockers

1. **Migration NOT_APPLIED** (OpenAPI inference) while app/worker at `805e260` already RPC-call binding parameter.
2. **RPC_NOT_MIGRATED** — `pg_proc` confirmation deferred to migration window.
3. **Zero production Instagram OAuth infrastructure** — no `channel_connections` / `instagram_oauth_credentials` rows; canary cannot proceed.
4. **Recipient NOT_READY** — no OAuth-bound DM conversation candidate.
5. Direct `schema_migrations` / `pg_proc` queries not executed (insufficient direct Postgres session); OpenAPI inference used instead.

Non-blocking notes:

- OAuth delivery flags correctly ABSENT on Vercel and Railway.
- No malformed bindings or unexpected OAuth-bound queue jobs.
- Outbox and queue show no active backlog at capture time.

---

## Decision

| Outcome | Value |
| --- | --- |
| **Decision** | **HOLD** |
| Ready for migration window? | **No** |
| Next approval required | `GO MIGRATION WINDOW` (after operator review of this evidence), then `GO DEPLOY FLAGS-OFF`; canary approvals remain separate |

**Blocking findings:** migration not applied; RPC not migrated; schema incompatible with deployed code; no OAuth connection or recipient; APP-before-DB exposure risk documented.

---

## Deferred execution

- Apply migration `20260621120000`
- `schema_migrations` row verification
- `pg_proc` overload query post-migration
- Vercel/Railway deploy actions
- OAuth flag enablement
- Text/image canary, provider Test Connection traffic
- Instagram OAuth connection onboarding in production (prerequisite for canary)

---

## Scope confirmation

IG-AUTH-2E.5A authorized production read-only preflight only. No migration execution. No database/RPC/queue writes. No environment or feature-flag changes. No deployment or restart. No provider calls or outbound messages. No canary. No private reply, webhook, profile enrichment, OAuth UI, refresh scheduler, or legacy retirement. No merge performed.
