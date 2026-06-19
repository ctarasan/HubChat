# IG-AUTH-2E.4A Production Readiness Preflight

> **Agent:** A  
> **Date:** 2026-06-19  
> **Branch:** `docs/ig-auth-2e-4a-production-readiness-preflight`  
> **Base master SHA:** `ad3b880c42686eacd001c11a800a699c26f2b088`  
> **Prior phases:** IG-AUTH-2E.3 merged ([#254](https://github.com/ctarasan/HubChat/pull/254), [#253](https://github.com/ctarasan/HubChat/pull/253))

---

## Summary

Preflight audit for controlled Instagram OAuth outbound rollout. Code on master is migration-ready and fail-closed behind default-OFF flags. **Production migration state and queue baseline could not be verified read-only** (Supabase project not linked in this environment). Vercel and Railway production are deployed at `ad3b880` matching master.

**Recommendation: HOLD** for migration window until operator runs read-only SQL in [`ig-auth-2e-4-production-migration-preflight.md`](../../instagram/ig-auth-2e-4-production-migration-preflight.md) and confirms RPC signature + migration applied.

---

## Master baseline

| Merge | SHA | Content |
| --- | --- | --- |
| #254 | `43b98fb` | Worker/queue OAuth binding + routing |
| #253 | `ad3b880` | 2E.3 security review prep docs |
| #252 / #250 | — | OAuth image/text foundations |

Confirmed on `git log`: #253 and #254 ancestors present at `ad3b880`.

---

## Migration and RPC analysis

| Item | Value |
| --- | --- |
| Migration file | `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Migration type | Additive `CREATE OR REPLACE` + optional `p_instagram_credential_binding jsonb default null` |
| `schema.sql` parity | Matches migration (16-parameter signature) |
| Destructive DDL | None |
| Mandatory backfill | None |
| Legacy caller compatibility | Param defaults `null`; binding omitted when not OAuth-managed |
| `SECURITY DEFINER` | Not set in migration (inherits `prosecdef = false` unless changed elsewhere) |
| Grants | No grant changes in migration; existing RPC grants assumed unchanged |

### Runtime contract map

| Layer | Location |
| --- | --- |
| RPC | `create_outbound_message_with_outbox` (+ `p_instagram_credential_binding`) |
| Repository | `supabaseOutboundCommandRepository.ts` — always passes binding param (`null` or JSON) |
| API enqueue | `resolveInstagramOutboundEnqueueBinding` → `messages/send/route.ts` |
| Outbox field | `payload_json.instagramCredentialBinding` |
| Queue parser | `instagramOAuthOutboundQueueContract.ts` (zod + `messageKind`) |
| Worker classifier | `classifyInstagramOutboundJob` in `instagramOAuthOutboundWorkerRouting.ts` |
| Worker gate | `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` |
| Text gate | `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` (+ foundation + runtime) |
| Image gate | `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` (+ foundation + runtime) |

---

## RPC overload assessment

PostgreSQL may retain **multiple overloads** when a new parameter is appended (signature identity changes). The 2E.3 migration does not `DROP FUNCTION` the prior 15-argument signature.

**Preflight requirement:** After migration apply, run the `pg_proc` query in the operator doc and confirm PostgREST resolves unambiguously when the repository supplies `p_instagram_credential_binding`.

| Check | Preflight result |
| --- | --- |
| Code review | Overload risk **possible** — verify in production |
| Production query executed | **Not performed** (no DB link) |
| Ambiguity | **UNKNOWN** until post-migration query |

---

## Production migration state

| Method | Result |
| --- | --- |
| `supabase migration list` | Failed — project not linked |
| Direct `schema_migrations` query | **Not performed** |
| **Status** | **UNKNOWN** |

Operator must classify: `NOT_APPLIED` | `ALREADY_APPLIED` | `PARTIALLY_APPLIED`.

**Critical coupling:** Deployed app (`ad3b880`) always RPC-calls `p_instagram_credential_binding`. If migration is **NOT_APPLIED**, **all outbound enqueue via this RPC is expected to fail** (LINE/Facebook/Instagram). If production outbound is currently healthy, migration may already be applied — must confirm.

---

## Queue/outbox baseline

| Check | Result |
| --- | --- |
| PENDING / PROCESSING / DEAD_LETTER counts | **Not queried** |
| Stale PROCESSING | **Not queried** |
| `instagramCredentialBinding` counts | **Not queried** |
| Malformed bindings | **Not queried** |
| OAuth-bound pending jobs | **Not queried** |

Sanitized SQL prepared in [`ig-auth-2e-4-production-migration-preflight.md`](../../instagram/ig-auth-2e-4-production-migration-preflight.md).

---

## Deployment ordering

### Proven from code

| Sequence | Verdict |
| --- | --- |
| **1. DB migration → 2. App + worker deploy (flags OFF)** | **SAFE** |
| **App/worker before DB migration** | **UNSAFE** (`APP-FIRST`) |
| **Worker before DB with new app** | **UNSAFE** (same RPC dependency) |
| **DB + deploy with flags OFF, legacy Instagram** | **SAFE** — no OAuth provider calls |

### Production deploy evidence (read-only)

| Surface | SHA | Captured |
| --- | --- | --- |
| Vercel Production | `ad3b880` | GitHub Deployments API `2026-06-19T05:33:53Z` |
| Railway production | `ad3b880` | GitHub Deployments API `2026-06-19T05:33:15Z` |

---

## Feature-flag inventory

Vercel Production (`vercel env ls production` — **names only**):

| Flag | State |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | **ABSENT** |

Railway Worker (`railway variables` — **names only**):

| Flag | State |
| --- | --- |
| All five OAuth outbound flags above | **ABSENT** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **PRESENT** (`DB_WITH_ENV_FALLBACK` — legacy Instagram runtime label only) |

Preflight expected state met for OAuth outbound gates.

---

## Flag dependency matrix

| FOUNDATION | RUNTIME | WORKER | TEXT | IMAGE | Expected behavior |
| --- | --- | --- | --- | --- | --- |
| OFF | OFF | OFF | OFF | OFF | Legacy Instagram only; OAuth jobs terminal if bound |
| ON | OFF | * | * | * | OAuth resolver/delivery disabled; worker routing blocked |
| ON | ON | OFF | ON | OFF | OAuth-bound jobs **terminal** (`OAUTH_WORKER_ROUTING_DISABLED`) |
| ON | ON | ON | OFF | OFF | Image binding jobs terminal (`OAUTH_OUTBOUND_IMAGE_DISABLED`) |
| ON | ON | ON | ON | OFF | OAuth **text** delivery allowed |
| ON | ON | ON | OFF | ON | OAuth **image** delivery allowed |
| ON | ON | ON | ON | ON | Both text and image paths available |
| TEXT without WORKER | — | OFF | ON | — | No OAuth provider call (worker gate) |
| WORKER without RUNTIME | ON | OFF | ON | — | Blocked at runtime/text gates |

Verified against `instagramOAuthOutboundWorkerRouting.ts`, flag modules, and `sendOutboundMessage.instagramOAuthWorkerRouting.test.ts`.

---

## Connection readiness

| Check | Preflight result |
| --- | --- |
| OAuth connection + credential SQL | **Prepared, not executed** |
| Canary connection identified | **Deferred** — operator must nominate one connection |
| Test Connection history | **Not verified** |

---

## Rollback safety

When `WORKER_ROUTING` (or text/image gate) is OFF and a `CONNECTION_BOUND` job is processed:

1. `failInstagramOAuthOutboundConfiguration`
2. `messageRepository.markFailed` with sanitized codes
3. `idempotency.markProcessed`
4. `TerminalOutboundDeliveryError` — **no retry**, **no legacy fallback**

**Enqueue note:** `resolveInstagramOutboundEnqueueBinding` does **not** check worker flags — OAuth-managed DMs can still enqueue bindings while flags are OFF; those jobs will terminal-fail at worker unless legacy Page token path still available (ambiguous config rejected at enqueue).

Rollback runbook requirement: **drain or avoid new OAuth-bound enqueue** before disabling routing mid-flight.

---

## Canary eligibility

Future canary (separate approval) requires:

- Migration applied + RPC verified
- All queue baseline checks green
- One OAuth connection + `channel_connection_id` on test conversation
- Operator-approved test IGSID
- Text first, then image
- All relevant flags ON
- One job at a time with multi-surface observation

Not executed in this phase.

---

## Risks and blockers

### Blocking

| # | Issue |
| --- | --- |
| B1 | **Production migration state UNKNOWN** — must confirm before declaring migration window open |
| B2 | **RPC overload not verified in production** — run `pg_proc` query post-migration |
| B3 | **Queue/outbox baseline not captured** — stale PROCESSING or existing OAuth-bound pending jobs unknown |

### Non-blocking

| # | Note |
| --- | --- |
| N1 | Vercel/Railway already at `ad3b880`; if migration not applied, outbound RPC may already be failing — operator smoke recommended |
| N2 | OAuth flags correctly absent on Vercel/Railway |
| N3 | Enqueue can create OAuth-bound jobs while worker flags OFF — jobs terminal-fail (fail-closed, not legacy) |

---

## GO/HOLD recommendation

| Decision | Rationale |
| --- | --- |
| **HOLD** | Migration state unknown; RPC overload unverified; queue baseline not captured |
| **READY FOR MIGRATION WINDOW** (after operator steps) | Apply migration → verify single/unambiguous RPC → run queue SQL → confirm legacy outbound smoke → then plan canary |

---

## Deferred execution

- Production migration execution
- Feature-flag enablement
- Live Meta text/image send
- Canary
- Private reply, legacy retirement, webhook/UI/refresh changes

---

## Scope confirmation

IG-AUTH-2E.4A production-readiness preflight only. Read-only production inspection where authorized (deploy SHAs, env **names**). No production migration execution. No database/RPC/queue writes. No environment or feature-flag changes. No deployment. No live Meta calls or outbound sends. No merge performed.

---

## Evidence checklist

| Field | Value |
| --- | --- |
| Master SHA | `ad3b880` |
| Migration filename | `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Production migration state | **UNKNOWN** |
| RPC signatures before/after | Before: 15 args (pre-2E.3); After: 16 args + optional `jsonb` |
| RPC overload ambiguity | **UNKNOWN** (verify post-migration) |
| Vercel deployment SHA | `ad3b880` |
| Railway deployment SHA | `ad3b880` |
| Flag states | All OAuth outbound flags **ABSENT** (Vercel + Railway) |
| Queue baseline | **Not captured** |
| Connection readiness | **Not captured** |
| GO/HOLD | **HOLD** |
