# Agent B — IG-AUTH-2E.3B Worker/Queue OAuth Routing Security Review Preparation

## Status

**Awaiting Agent A implementation PR** — independent review prep only. Use this package when PR opens; do not merge by Agent B.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2E.3-B |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2e-3b-worker-routing-review-prep` |
| Base master SHA | `bac34bc` (post PR #251/#252 docs + image foundation) |
| Upstream foundation | IG-AUTH-2E.0 audit; IG-AUTH-2E.1 text (#250); IG-AUTH-2E.2 image (#252); IG-AUTH-2B queue contract (#243) |
| Primary docs | [`ig-auth-2e-3-worker-queue-review-checklist.md`](../../instagram/ig-auth-2e-3-worker-queue-review-checklist.md), [`ig-auth-2e-0-outbound-contract-audit`](../agent-a/2026-06-19-ig-auth-2e-0-outbound-contract-audit.md), [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md), [`ig-auth-2e-2-oauth-dm-image-review-checklist.md`](../../instagram/ig-auth-2e-2-oauth-dm-image-review-checklist.md) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.3 wires **exact OAuth connection binding** from enqueue through worker routing to the merged text/image delivery services (2E.1/2E.2). Production Instagram outbound today is **100% legacy**: Page token + `graph.facebook.com` via `InstagramAdapter`, with tenant-only adapter resolution and **no** `instagramCredentialBinding` on outbox/queue payloads.

Agent B must verify Agent A PR:

1. Emits safe `CONNECTION_BOUND` binding at enqueue (derived from DB, not client)
2. Routes worker jobs to OAuth text/image services only when binding + flags allow
3. Never falls back to legacy on OAuth failure or ambiguous binding
4. Preserves legacy jobs (absent binding → `{ mode: "LEGACY" }`)
5. Keeps idempotency, terminal guard, and retry policy intact

**Production flag-on, live Meta send, migration execution, and deployment remain out of scope** unless explicitly claimed — then **BLOCKED**.

---

## Current master baseline (pre-2E.3)

| Merge | Content |
| --- | --- |
| #252 | OAuth DM image provider + application service (not worker-wired) |
| #250 | OAuth DM text provider + application service (not worker-wired) |
| #251 | IG-AUTH-2E.2-B review prep docs |
| #248 | IG-AUTH-2E.0 outbound contract audit |
| #243 | Queue binding types + zod contract + resolver foundation |

Master HEAD: `bac34bc`. All OAuth outbound flags default OFF. Worker still uses legacy `InstagramAdapter`.

---

## Current queue/outbox/worker map

```text
UI / API
  POST /api/messages/send
    → app/api/messages/send/route.ts
    → SupabaseOutboundCommandRepository.createOutboundMessageAndOutbox
      → RPC create_outbound_message_with_outbox (supabase/schema.sql)
        → INSERT messages (external_message_id null, PENDING)
        → INSERT outbox_events topic=message.outbound.requested
           payload: tenantId, messageId, conversationId, channel, channelThreadId,
                    content, messageType, media fields
           (NO instagramCredentialBinding today)

Outbox relay
  worker/outboxRelayWorker.ts
    → queue.enqueue("message.outbound.requested", payload)

Outbound worker
  worker/outboundWorker.ts
    → queue.claimBatch("message.outbound.requested")
    → SendOutboundMessageUseCase.execute(payload)
    → markQueueDoneWhenMessageTerminal (delivery snapshot SENT/FAILED)

Send path (Instagram today)
  sendOutboundMessage.ts
    → idempotency scope: `${tenantId}:${messageId}`
    → instagramOutboundAdapterResolver.resolve(tenantId)  // tenant-only
    → validateInstagramDmOutbound
    → InstagramAdapter.sendMessage / sendPrivateReply
       graph.facebook.com/{pageId}/messages?access_token=...

OAuth foundations (exist, not worker-wired)
  instagramOAuthTextDelivery.ts   — resolveForDelivery + text flag triple gate
  instagramOAuthImageDelivery.ts  — resolveForDelivery + image flag triple gate
  instagramOAuthOutboundQueueContract.ts — binding parse/serialize (IG-AUTH-2B)
```

### Key files (review targets for Agent A PR)

| Layer | File | Current role |
| --- | --- | --- |
| API enqueue | `app/api/messages/send/route.ts` | Auth, validation, RPC call |
| Outbox RPC | `supabase/schema.sql` `create_outbound_message_with_outbox` | Message + outbox payload |
| Outbox repo | `supabaseOutboundCommandRepository.ts` | RPC wrapper |
| Relay | `worker/outboxRelayWorker.ts` | outbox → queue |
| Consumer | `worker/outboundWorker.ts` | Claim, execute, retry/DLQ |
| Use case | `sendOutboundMessage.ts` | Adapter resolve, send, idempotency |
| Legacy resolver | `createInstagramOutboundAdapterResolver.ts` | Page token adapter |
| OAuth text | `instagramOAuthTextDelivery.ts` | Service-only foundation |
| OAuth image | `instagramOAuthImageDelivery.ts` | Service-only foundation |
| Binding contract | `instagramOAuthOutboundQueueContract.ts` | zod + prohibited fields |
| Terminal guard | `outboundTerminalGuard.ts` | DONE only when SENT/FAILED |
| Retry taxonomy | `outboundDeliveryError.ts` | Retryable vs terminal |

---

## Queue binding matrix

Source of truth: `src/domain/instagramOAuthOutboundContract.ts`, `src/lib/instagramOAuthOutboundQueueContract.ts`.

| Field | Required for OAuth | Source of truth | Persisted where | Worker validation | Security risk |
| --- | --- | --- | --- | --- | --- |
| `bindingVersion` / `contractVersion` | Yes | Constant `1` | Queue payload `instagramCredentialBinding` | Strict literal match; unknown → fail closed | Version drift → wrong semantics |
| `tenantId` | Yes | Job payload + DB cross-check | Queue payload root | Must match conversation/message tenant | Cross-tenant credential use |
| `channelConnectionId` | Yes | `conversations.channel_connection_id` + OAuth credential row | Binding object only (UUID) | Exact match to resolver input; missing → fail closed | Wrong connection → wrong token/recipient binding |
| `channelType` | Implicit | `INSTAGRAM` on Instagram jobs | Queue `channel` field | Must be INSTAGRAM for OAuth route | Route to wrong adapter family |
| `authFamily` | Yes | DB `instagram_oauth_credentials.auth_family` | Binding (fixed literal for OAuth) | Must be `INSTAGRAM_BUSINESS_LOGIN`; never from client | Legacy token on OAuth path |
| `deliveryPath` | Yes | Policy (`DATABASE_ONLY` for OAuth) | Binding literal | Must be `DATABASE_ONLY`; ENV fallback forbidden | ENV/Page token leak |
| `messageKind` | Yes | `messageType` (`TEXT` / `IMAGE`) | Queue payload | Maps to text vs image OAuth service | Wrong provider payload |
| `conversationId` | Yes | Conversation row | Queue payload | Ownership + thread validation | Mis-bound thread |
| `messageId` | Yes | RPC-generated UUID | Queue payload | Idempotency + terminal guard | Duplicate send |
| `idempotencyKey` | Yes | `outbound:{tenantId}:{messageId}` (outbox) | outbox + queue | Preserve existing scope | Duplicate delivery |

### Critical binding rules

- Exact `channelConnectionId` required for `CONNECTION_BOUND` — no tenant-global lookup
- `authFamily` and `deliveryPath` derived from DB/policy at enqueue — **never from client body**
- Binding immutable across retries (same job payload reprocessed)
- No credentials/secrets in payload — prohibited fields enforced by zod
- Unknown `contractVersion` → fail closed before provider call
- Absent binding on legacy jobs → treat as `{ mode: "LEGACY" }` (backwards compatible)

---

## Routing decision matrix

Expected worker/use-case routing (Agent A PR must implement or document equivalent):

| Job type | Binding | Flags (all required ON) | Route | Fallback allowed |
| --- | --- | --- | --- | --- |
| LINE | N/A | N/A | LINE adapter | N/A |
| Facebook | N/A | N/A | Facebook adapter | N/A |
| Legacy Instagram DM text/image | absent or `{ mode: "LEGACY" }` | N/A | `InstagramAdapter` (Page token) | Legacy ENV/DB only within legacy policy |
| OAuth Instagram text | `CONNECTION_BOUND` + valid UUID | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_TEXT | `instagramOAuthTextDelivery.sendText` | **None** |
| OAuth Instagram image | `CONNECTION_BOUND` + valid UUID | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_IMAGE | `instagramOAuthImageDelivery.sendImage` | **None** |
| OAuth binding missing | `CONNECTION_BOUND` expected but absent | any | Fail closed | **None** |
| OAuth ambiguous binding | invalid zod / wrong version / prohibited fields | any | Fail closed | **None** |
| Unsupported Instagram kind | e.g. `DOCUMENT_PDF` on OAuth path | any | Fail closed terminal | **None** |
| Instagram private reply | comment thread | N/A | Legacy private-reply path only (2F deferred for OAuth) | Must not use OAuth text/image services |

### Routing invariants

```text
OAuth failure → never routes to legacy InstagramAdapter
Legacy failure → never routes to OAuth services
Ambiguous binding → routes to neither (fail closed)
Worker routing flag OFF → OAuth binding jobs fail closed, not legacy fallback
```

---

## Legacy compatibility

Agent A PR must preserve:

- Old queue jobs without `instagramCredentialBinding` deserialize and run legacy path
- `{ mode: "LEGACY" }` explicit binding runs Page-token adapter
- `DB_WITH_ENV_FALLBACK` remains legacy-only — forbidden when OAuth binding present
- LINE/Facebook channels unchanged
- No automatic legacy-to-OAuth migration or destructive backfill in 2E.3

### Misclassification risks

| Risk | Review check |
| --- | --- |
| Empty object `{}` mistaken for CONNECTION_BOUND | zod discriminated union rejects |
| Client-supplied binding accepted | API must derive from DB only |
| `channel_connection_id` on conversation null but OAuth attempted | Fail closed at enqueue or worker |
| Legacy job with accidental binding field | Parse must allow LEGACY mode only when valid |

---

## Historical null-binding risk

Conversations/jobs with `conversations.channel_connection_id IS NULL`:

- **Cannot route OAuth** — no CONNECTION_BOUND emission
- Must fail closed if OAuth-managed connection expected
- No "first active connection" or tenant-wide credential selection
- Sanitized operator error (no token, no internal IDs in public preview)
- Remediation/backfill of historical rows **deferred and explicit** — not in 2E.3 scope unless Agent A claims it (**review carefully**)

---

## Feature flags

Expected new flag:

```text
HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED
```

Required combinations:

| Path | Flags |
| --- | --- |
| OAuth text delivery via worker | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_TEXT |
| OAuth image delivery via worker | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_IMAGE |

Validation:

| Case | Expected |
| --- | --- |
| absent / blank / false / unsupported | OFF |
| explicit true only | ON (with other required gates) |
| OUTBOUND_TEXT alone | Does not enable worker OAuth routing |
| WORKER_ROUTING alone | Does not enable text/image send |
| Production env values in PR | **BLOCKED** |

Existing service flags (`OUTBOUND_TEXT`, `OUTBOUND_IMAGE`) remain independent gates on the delivery services themselves — worker must respect both layers.

---

## Idempotency review

Agent A PR must preserve:

- Terminal-state skip via idempotency (`hasProcessed` → reconcile snapshot, no resend)
- `external_message_id` guard — SENT messages not re-sent
- Exact job binding unchanged across retries
- No duplicate provider send after DONE
- No second retry loop inside OAuth provider clients (2E.1/2E.2 already single-attempt)
- Atomic queue claim (`claim_queue_jobs`)
- Concurrency protection in outbound worker

### Failure window (unchanged policy unless explicitly amended with tests)

```text
provider success → markSent(external_message_id) failure
```

Require existing recovery: retryable error, idempotency release, queue retry — **not** silent duplicate send. Agent B must verify behavior unchanged or safely extended with tests.

---

## Retry/error matrix (review expectations)

| Error | Retryable | Queue action | Credential action | Safe error preview |
| --- | --- | --- | --- | --- |
| Worker routing disabled | No | Terminal / DLQ per policy | None | Feature disabled code |
| Missing binding | No | Terminal | None | Configuration code |
| Wrong auth family | No | Terminal | None | Configuration code |
| Wrong delivery path | No | Terminal | None | Configuration code |
| Credential missing | No | Terminal | None | Not found code |
| REAUTH_REQUIRED | No | Terminal | No auto mutation unless existing policy | Reauth code |
| TOKEN_EXPIRED / REVOKED | No | Terminal | No unsafe mutation | Reauth/revoked code |
| PERMISSION_MISSING | No | Terminal | None | Permission code |
| RECIPIENT_UNAVAILABLE | No | Terminal | None | Recipient code |
| MESSAGE_WINDOW_CLOSED | No | Terminal | None | Window code |
| RATE_LIMITED | Yes | Retry with backoff | None | Rate limit code |
| PROVIDER_UNAVAILABLE / timeout / 5xx | Yes | Retry | None | Retryable code |
| PROVIDER_CONTRACT_ERROR | No | Terminal | None | Contract code |
| IMAGE_URL_INVALID / UNSUPPORTED_MEDIA | No | Terminal | None | Media code |
| Ambiguous configuration | No | Terminal | None | Ambiguous code |

Terminal errors must not loop indefinitely. Retryable errors must not mark idempotency processed until terminal success/failure recorded.

---

## DB/RPC review criteria

If migration/RPC changes appear in Agent A PR:

| Requirement | Review |
| --- | --- |
| Additive only | No destructive DDL |
| `schema.sql` parity | Migration reflected in schema.sql |
| Backward-compatible RPC defaults | Old callers still work |
| Legacy rows nullable | `channel_connection_id` remains nullable |
| OAuth binding validation | Complete at enqueue (DB-side or app-side before persist) |
| Indexes | Only if justified; no secret columns |
| Production execution | **Forbidden** in PR |

### BLOCKED conditions

- Destructive migration or mandatory backfill without evidence
- Existing caller breakage (non-Instagram channels)
- Credential material stored in queue payload or outbox JSON
- Breaking change to `create_outbound_message_with_outbox` without legacy path

Expected additive shape (illustrative — Agent A may differ):

- Optional binding parameter or post-insert enrichment from conversation join
- Payload JSON includes `instagramCredentialBinding` only when OAuth-managed connection confirmed

---

## Secret/logging checklist

Forbidden in queue payload, logs, audit, `last_error_preview`:

- Access token / Bearer material
- Authorization header
- Ciphertext / app secret
- Raw provider response body
- Full message text (existing policy)
- Full signed image URL query string
- Full sender/recipient IDs (policy-dependent masking)
- Raw connection configuration secrets

Allowed:

- Stable internal error codes
- Retryability flag
- Internal job/message/connection UUID references per existing policy
- Masked identifiers
- Message kind / messageType
- authFamily / deliveryPath / binding mode (non-secret)

---

## Worker isolation and controlled invocation

Review call graph:

| Binding + flags | Must call | Must NOT call |
| --- | --- | --- |
| OAuth text | `instagramOAuthTextDelivery` only | legacy adapter, image service, Facebook |
| OAuth image | `instagramOAuthImageDelivery` only | legacy adapter, text service, Facebook |
| Legacy | `InstagramAdapter` only | OAuth text/image services |
| Invalid/ambiguous | None (fail closed) | any provider |
| Private reply | Legacy private-reply path | OAuth DM services |

Require tests with spies/mocks proving wrong paths **not called**.

---

## Test matrix (summary)

See checklist doc for full checklist. Categories:

1. **Binding/enqueue** — emission, exact connection, client override ignored, legacy compat, null binding fail closed
2. **Worker routing** — each flag OFF, OAuth text/image success, legacy success, ambiguous failure, no fallback
3. **Idempotency/retry** — DONE no resend, external_message_id persisted, retryable vs terminal, binding retained, concurrent claim
4. **Regression** — LINE, Facebook, legacy Instagram text/image, private reply, webhooks, OAuth unit foundations unchanged

---

## Production boundary

Agent A PR must **not** include:

- Production env/flag values
- Migration execution against production
- Deployment / canary
- Live Meta HTTP calls or real outbound sends in CI
- Legacy retirement
- Private reply OAuth migration
- OAuth UI
- Operator-facing "production ready" claims

Wording:

> OAuth worker/queue binding foundation merged. Production enablement and live verification remain deferred.

Any live/production cutover claim → **BLOCKED**

---

## Verdict rubric

| Verdict | When |
| --- | --- |
| **PASS** | Safe binding emission; correct routing table; no fallback violations; flags default OFF; idempotency preserved; legacy compat; tests prove negative paths; no production/live scope |
| **PASS WITH NOTES** | Non-blocking gaps (e.g. historical null-binding ops note, extra logging) |
| **CHANGES REQUESTED** | Client-derived binding; OAuth→legacy fallback; missing flag gates; binding mutable; weak tests; enqueue/worker mismatch |
| **BLOCKED** | Secrets in queue; destructive migration; production flag-on; live send; credential in payload; routing without binding validation |

---

## Potential conflicts with Agent A

| Area | Risk | Mitigation |
| --- | --- | --- |
| `sendOutboundMessage.ts` | Large routing change | Review delta; regression tests for LINE/FB/legacy IG |
| `create_outbound_message_with_outbox` | RPC + schema.sql + migration | Verify additive, legacy payload unchanged |
| `supabaseOutboundCommandRepository.ts` | New binding parameter | Docs-only conflict unlikely |
| `worker/main.ts` | OAuth service wiring | Ensure flag-gated |
| Shared binding zod | Agent A may extend contract version | Review version gate |
| LATEST pointers | Both agents | B skips LATEST updates |

---

## Scope confirmation

IG-AUTH-2E.3B docs/review-prep only. No implementation/source/runtime/test/schema/migration changes. No production flag or environment changes. No migration execution. No queue/worker runtime modification. No live Meta calls or outbound messages. No merge performed by Agent B.

## Verification

At commit: `git diff --check`, docs-only diff, hidden/bidi scan, secret scan.
