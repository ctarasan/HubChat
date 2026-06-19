# Agent B — IG-AUTH-2E.3B Worker/Queue OAuth Routing Security Review Preparation

## Status

**Finalized** — docs aligned with merged implementation (PR #254 on master `43b98fb`). Ready for maintainer merge of PR #253.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2E.3-B |
| Date | 2026-06-19 (finalized 2026-06-19 post-merge) |
| Branch | `docs/ig-auth-2e-3b-worker-routing-review-prep` |
| Base master SHA | `43b98fb` (post PR #254 merge) |
| Implementation PR | [#254](https://github.com/ctarasan/HubChat/pull/254) — merged |
| Implementation commit | `6041082d468ea8f0c4e95d7650aeba549bbc1083` |
| Documentation PR | [#253](https://github.com/ctarasan/HubChat/pull/253) — open |
| Upstream foundation | IG-AUTH-2E.0 audit; IG-AUTH-2E.1 text (#250); IG-AUTH-2E.2 image (#252); IG-AUTH-2B queue contract (#243) |
| Primary docs | [`ig-auth-2e-3-worker-queue-review-checklist.md`](../../instagram/ig-auth-2e-3-worker-queue-review-checklist.md), [`ig-auth-2e-0-outbound-contract-audit`](../agent-a/2026-06-19-ig-auth-2e-0-outbound-contract-audit.md), [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md), [`ig-auth-2e-2-oauth-dm-image-review-checklist.md`](../../instagram/ig-auth-2e-2-oauth-dm-image-review-checklist.md) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.3 merged on master wires **exact OAuth connection binding** from enqueue through worker routing to the merged text/image delivery services (2E.1/2E.2). OAuth-managed Instagram DM jobs persist a versioned `CONNECTION_BOUND` snapshot on the outbox/queue payload; the worker routes deterministically to OAuth text or image services when all required flags are ON, or fails closed when binding is present but routing is disabled. Legacy Instagram jobs without binding continue through the existing Page-token `InstagramAdapter` unchanged.

**Worker/queue integration is merged in code behind default-OFF gates.** Production migration execution, feature-flag enablement, live delivery, and canary remain deferred.

This prep package documents the independent-review criteria used for PR #254 and preserves the checklist for future 2E.4+/2E.7 slices.

---

## Master baseline (post 2E.3)

| Merge | Content |
| --- | --- |
| #254 | Versioned persisted OAuth queue binding; worker controlled OAuth text/image routing |
| #252 | OAuth DM image provider + application service |
| #250 | OAuth DM text provider + application service |
| #251 | IG-AUTH-2E.2-B review prep docs |
| #248 | IG-AUTH-2E.0 outbound contract audit |
| #243 | Queue binding types + zod contract + resolver foundation |

Master HEAD: `43b98fb`. All OAuth outbound flags default OFF including `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED`.

---

## Final IG-AUTH-2E.3 implementation status

| Field | Value |
| --- | --- |
| Implementation PR | #254 |
| Implementation commit | `6041082d468ea8f0c4e95d7650aeba549bbc1083` |
| Merged master SHA | `43b98fb7b1f2636c5a1580e92693e8512b35ccb2` |
| Status | merged |
| Independent review result | **PASS** |
| Review comment | https://github.com/ctarasan/HubChat/pull/254#issuecomment-4748741341 |
| Targeted tests | 35 passed (6 PR test files) |
| Full suite | 2255 passed |
| Typecheck / lint / build | PASS |
| Hidden/bidi scan | PASS |
| Secret scan | PASS (no matches) |

### Non-blocking review notes

- Unrelated flaky `channelSettingsTestConnection.test.ts` passed on rerun during full-suite verification
- Trailing whitespace limited to Agent A implementation report (non-blocking)
- Send-route binding emission covered through resolver and RPC repository tests rather than a dedicated route integration test

### Implemented controls

- Versioned persisted connection binding (`contractVersion: 1`, `mode: CONNECTION_BOUND`)
- Exact `channelConnectionId` derived from `conversation.channel_connection_id` at enqueue
- `authFamily: INSTAGRAM_BUSINESS_LOGIN` and `deliveryPath: DATABASE_ONLY` snapshots from trusted DB/policy
- `messageKind: TEXT | IMAGE` snapshot at enqueue
- Binding persisted via RPC `p_instagram_credential_binding` into outbox payload (not TypeScript-only)
- Strict zod parser with prohibited-field rejection at worker boundary
- Deterministic OAuth text/image worker routing with no legacy/ENV/alternate-connection fallback
- Historical null-binding OAuth cases fail closed (no active-connection guessing)
- Legacy Instagram jobs remain backward-compatible
- Retry, idempotency, claim, and `external_message_id` behavior preserved
- `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` default OFF

### Not performed

- Production migration execution
- Production feature-flag enablement
- Live Meta delivery
- Production canary
- Deployment
- Legacy retirement

---

## Current queue/outbox/worker map (merged)

```text
UI / API
  POST /api/messages/send
    → app/api/messages/send/route.ts
    → resolveInstagramOutboundEnqueueBinding (DB-derived, not client)
    → SupabaseOutboundCommandRepository.createOutboundMessageAndOutbox
      → RPC create_outbound_message_with_outbox
        → INSERT messages (external_message_id null, PENDING)
        → INSERT outbox_events topic=message.outbound.requested
           payload includes instagramCredentialBinding when OAuth-managed

Outbox relay
  worker/outboxRelayWorker.ts
    → queue.enqueue("message.outbound.requested", payload)

Outbound worker
  worker/outboundWorker.ts
    → queue.claimBatch("message.outbound.requested")
    → SendOutboundMessageUseCase.execute(payload)
    → markQueueDoneWhenMessageTerminal (delivery snapshot SENT/FAILED)

Send path (Instagram — merged)
  sendOutboundMessage.ts
    → classifyInstagramOutboundJob (parseInstagramCredentialBindingFromPayload)
    → OAUTH_INSTAGRAM_JOB → executeInstagramOAuthOutbound
       → assertOAuthInstagramWorkerRoutingEnabled
       → instagramOAuthTextDelivery.sendText OR instagramOAuthImageDelivery.sendImage
          (binding.channelConnectionId from persisted snapshot; IGSID from channelThreadId)
    → LEGACY_INSTAGRAM_JOB → InstagramAdapter (Page token, unchanged)
    → INVALID_OR_AMBIGUOUS_JOB → terminal configuration error (neither path)
```

### Key files (merged implementation)

| Layer | File | Role |
| --- | --- | --- |
| API enqueue | `app/api/messages/send/route.ts` | Auth, binding resolution, RPC call |
| Enqueue binding | `resolveInstagramOutboundEnqueueBinding.ts` | DB-derived CONNECTION_BOUND snapshot |
| Outbox RPC | `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` | Optional `p_instagram_credential_binding` |
| Outbox repo | `supabaseOutboundCommandRepository.ts` | Forwards binding to RPC |
| Worker boot | `worker/main.ts` | Wires OAuth text/image delivery services |
| Use case | `sendOutboundMessage.ts` | OAuth vs legacy routing |
| Routing | `instagramOAuthOutboundWorkerRouting.ts` | Job classification + flag gates |
| Binding contract | `instagramOAuthOutboundQueueContract.ts` | Strict zod + prohibited fields |
| Worker flag | `instagramOAuthWorkerRoutingFlags.ts` | `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` |
| Terminal guard | `outboundTerminalGuard.ts` | DONE only when SENT/FAILED |

---

## Queue binding matrix

Source of truth: `src/domain/instagramOAuthOutboundContract.ts`, `src/lib/instagramOAuthOutboundQueueContract.ts`.

| Field | Required for OAuth | Source of truth | Persisted where | Worker validation | Security risk |
| --- | --- | --- | --- | --- | --- |
| `contractVersion` | Yes | Constant `1` | Queue payload `instagramCredentialBinding` | Strict literal match; unknown → fail closed | Version drift → wrong semantics |
| `tenantId` | Yes | Job payload + DB cross-check | Queue payload root | Must match conversation/message tenant | Cross-tenant credential use |
| `channelConnectionId` | Yes | `conversations.channel_connection_id` + OAuth credential row | Binding object only (UUID) | Exact match to resolver input; missing → fail closed | Wrong connection → wrong token/recipient binding |
| `channelType` | Implicit | `INSTAGRAM` on Instagram jobs | Queue `channel` field | Must be INSTAGRAM for OAuth route | Route to wrong adapter family |
| `authFamily` | Yes | DB `instagram_oauth_credentials.auth_family` | Binding (fixed literal for OAuth) | Must be `INSTAGRAM_BUSINESS_LOGIN`; never from client | Legacy token on OAuth path |
| `deliveryPath` | Yes | Policy (`DATABASE_ONLY` for OAuth) | Binding literal | Must be `DATABASE_ONLY`; ENV fallback forbidden | ENV/Page token leak |
| `messageKind` | Yes | `messageType` (`TEXT` / `IMAGE`) | Queue payload | Maps to text vs image OAuth service | Wrong provider payload |
| `conversationId` | Yes | Conversation row | Queue payload | Ownership + thread validation | Mis-bound thread |
| `messageId` | Yes | RPC-generated UUID | Queue payload | Idempotency + terminal guard | Duplicate send |
| `idempotencyKey` | Yes | `outbound:{tenantId}:{messageId}` (outbox) | outbox + queue | Preserve existing scope | Duplicate delivery |

### Critical binding rules (verified in PR #254)

- Exact `channelConnectionId` required for `CONNECTION_BOUND` — no tenant-global lookup for OAuth enqueue
- `authFamily` and `deliveryPath` derived from DB/policy at enqueue — **never from client body**
- Binding immutable across retries (same job payload reprocessed)
- No credentials/secrets in payload — prohibited fields enforced by zod
- Unknown `contractVersion` → fail closed before provider call
- Absent binding on legacy jobs → legacy path (backwards compatible)

---

## Routing decision matrix (merged behavior)

| Job type | Binding | Flags (all required ON) | Route | Fallback allowed |
| --- | --- | --- | --- | --- |
| LINE | N/A | N/A | LINE adapter | N/A |
| Facebook | N/A | N/A | Facebook adapter | N/A |
| Legacy Instagram DM text/image | absent or `{ mode: "LEGACY" }` | N/A | `InstagramAdapter` (Page token) | Legacy ENV/DB only within legacy policy |
| OAuth Instagram text | `CONNECTION_BOUND` + valid UUID | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_TEXT | `instagramOAuthTextDelivery.sendText` | **None** |
| OAuth Instagram image | `CONNECTION_BOUND` + valid UUID | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_IMAGE | `instagramOAuthImageDelivery.sendImage` | **None** |
| OAuth binding missing/invalid | invalid zod / wrong version / prohibited fields | any | Fail closed | **None** |
| Unsupported Instagram kind | e.g. `DOCUMENT_PDF` on OAuth path | any | Fail closed terminal | **None** |
| Instagram private reply | comment thread | N/A | Legacy private-reply path only (2F deferred for OAuth) | Must not use OAuth text/image services |

### Routing invariants (verified)

```text
OAuth failure → never routes to legacy InstagramAdapter
Legacy failure → never routes to OAuth services
Ambiguous binding → routes to neither (fail closed)
Worker routing flag OFF → OAuth binding jobs fail closed, not legacy fallback
```

---

## Legacy compatibility

Merged PR #254 preserves:

- Old queue jobs without `instagramCredentialBinding` deserialize and run legacy path
- `{ mode: "LEGACY" }` explicit binding runs Page-token adapter
- `DB_WITH_ENV_FALLBACK` remains legacy-only — forbidden when OAuth binding present
- LINE/Facebook channels unchanged
- No automatic legacy-to-OAuth migration or destructive backfill in 2E.3

### Misclassification risks (reviewed)

| Risk | Review check |
| --- | --- |
| Empty object `{}` mistaken for CONNECTION_BOUND | zod discriminated union rejects |
| Client-supplied binding accepted | API derives from DB only; `SendMessageSchema` has no binding field |
| `channel_connection_id` on conversation null but OAuth attempted | Fail closed at enqueue when OAuth-only tenant |
| Legacy job with accidental binding field | Parse must allow LEGACY mode only when valid |

---

## Historical null-binding behavior

Conversations/jobs with `conversations.channel_connection_id IS NULL`:

- **Cannot emit OAuth binding** when OAuth-only tenant (no legacy Page token) — enqueue fails closed
- When legacy Page token exists, null binding returns legacy path (no OAuth enqueue)
- No "first active connection" or tenant-wide credential selection for OAuth
- Sanitized operator error (no token, no internal IDs in public preview)
- Historical null-binding remediation/backfill remains separate deferred work

---

## Feature flags

Merged flag:

```text
HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED
```

Required combinations:

| Path | Flags |
| --- | --- |
| OAuth text delivery via worker | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_TEXT |
| OAuth image delivery via worker | FOUNDATION + RUNTIME + **WORKER_ROUTING** + OUTBOUND_IMAGE |

Validation (verified):

| Case | Expected |
| --- | --- |
| absent / blank / false / unsupported | OFF |
| explicit true only | ON (with other required gates) |
| OUTBOUND_TEXT alone | Does not enable worker OAuth routing |
| WORKER_ROUTING alone | Does not enable text/image send |
| Production env values in PR | **Absent** (verified) |

---

## Idempotency review

PR #254 preserves:

- Terminal-state skip via idempotency (`hasProcessed` → reconcile snapshot, no resend)
- `external_message_id` guard — SENT messages not re-sent
- Exact job binding unchanged across retries
- No duplicate provider send after DONE
- No second retry loop inside OAuth provider clients (2E.1/2E.2 already single-attempt)
- Atomic queue claim (`claim_queue_jobs`)
- Routing occurs after successful claim inside `SendOutboundMessageUseCase.execute`

### Failure window (unchanged policy)

```text
provider success → markSent(external_message_id) failure
```

Existing recovery: retryable error, idempotency release, queue retry — **not** silent duplicate send.

---

## Retry/error matrix (merged behavior)

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

---

## DB/RPC (merged)

Migration `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql`:

| Requirement | Status |
| --- | --- |
| Additive only | Verified — optional param with default null |
| `schema.sql` parity | Verified |
| Backward-compatible RPC defaults | Old callers omit param → unchanged |
| Legacy rows nullable | `channel_connection_id` remains nullable |
| OAuth binding validation | App-side at enqueue + worker parse |
| Production execution | **Not performed** |

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

## Worker isolation and controlled invocation (verified)

| Binding + flags | Must call | Must NOT call |
| --- | --- | --- |
| OAuth text | `instagramOAuthTextDelivery` only | legacy adapter, image service, Facebook |
| OAuth image | `instagramOAuthImageDelivery` only | legacy adapter, text service, Facebook |
| Legacy | `InstagramAdapter` only | OAuth text/image services |
| Invalid/ambiguous | None (fail closed) | any provider |
| Private reply | Legacy private-reply path | OAuth DM services |

Tests with spies prove wrong paths **not called** (`sendOutboundMessage.instagramOAuthWorkerRouting.test.ts`).

---

## Test matrix (summary)

See checklist doc for full checklist. Categories verified in PR #254:

1. **Binding/enqueue** — emission, exact connection, client override ignored, legacy compat, null binding fail closed
2. **Worker routing** — each flag OFF, OAuth text/image success, legacy success, ambiguous failure, no fallback
3. **Idempotency/retry** — DONE no resend, external_message_id persisted, retryable vs terminal, binding retained
4. **Regression** — LINE, Facebook, legacy Instagram text/image, private reply, webhooks, OAuth unit foundations unchanged

---

## Production boundary

Merged PR #254 does **not** include:

- Production env/flag values
- Migration execution against production
- Deployment / canary
- Live Meta HTTP calls or real outbound sends
- Legacy retirement
- Private reply OAuth migration
- OAuth UI
- Operator-facing "production ready" claims

Wording:

> Worker/queue integration is merged in code behind default-OFF gates. Production migration execution, feature-flag enablement, live delivery, and canary remain deferred.

---

## Remaining deferred work

| Phase | Scope |
| --- | --- |
| Production migration execution | Apply additive migration in controlled environments |
| Controlled environment configuration | Staging/non-production flag configuration |
| IG-AUTH-2E.4+ | Staging / live provider smoke |
| IG-AUTH-2E.7 | Production canary (explicit operator GO) |
| IG-AUTH-2F | Private reply OAuth |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |
| Historical backfill | Null `channel_connection_id` remediation (if needed) |
| Operational monitoring / rollback validation | Post-canary |

---

## Verdict rubric (used for PR #254 review)

| Verdict | When |
| --- | --- |
| **PASS** | Safe binding emission; correct routing table; no fallback violations; flags default OFF; idempotency preserved; legacy compat; tests prove negative paths; no production/live scope |
| **PASS WITH NOTES** | Non-blocking gaps (e.g. historical null-binding ops note, extra logging) |
| **CHANGES REQUESTED** | Client-derived binding; OAuth→legacy fallback; missing flag gates; binding mutable; weak tests; enqueue/worker mismatch |
| **BLOCKED** | Secrets in queue; destructive migration; production flag-on; live send; credential in payload; routing without binding validation |

**PR #254 result:** PASS

---

## Scope confirmation

IG-AUTH-2E.3B docs/review-prep status and alignment only. No implementation/source/runtime/test/schema/migration changes. No production flag or environment changes. No migration execution. No queue/worker runtime modification. No live Meta calls or outbound messages. No merge performed by Agent B.

## Verification

At commit: `git diff --check`, docs-only diff, hidden/bidi scan, secret scan.
