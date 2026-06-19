# IG-AUTH-2E.3 — Worker/Queue OAuth Routing Security Review Checklist

Review prep for Agent A implementation PR. Baseline: master `bac34bc` (post PR #250/#252 OAuth text/image foundations). Companion: [`2026-06-19-ig-auth-2e-3b-worker-routing-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-3b-worker-routing-review-prep.md), [`2026-06-19-ig-auth-2e-0-outbound-contract-audit.md`](../agent-a/2026-06-19-ig-auth-2e-0-outbound-contract-audit.md).

**Expected scope:** Queue/outbox binding emission, worker controlled OAuth routing to merged text/image services, additive RPC/migration if needed, default-OFF worker routing flag, mocked/integration tests. **Still deferred:** production flag-on, live Meta send, deployment, legacy retirement, private reply OAuth, OAuth UI.

---

## 1. Scope gate

### Allowed (expected in implementation PR)

- [ ] `instagramCredentialBinding` emission at enqueue (CONNECTION_BOUND for OAuth-managed connections)
- [ ] Additive RPC/outbox payload extension (if required)
- [ ] Worker/use-case routing to `instagramOAuthTextDelivery` / `instagramOAuthImageDelivery`
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` (default OFF)
- [ ] Binding parse/validate at worker boundary (reuse IG-AUTH-2B contract)
- [ ] Tests: enqueue, routing, idempotency, legacy regression
- [ ] Agent A implementation report

### Forbidden — must be absent

- [ ] Production env values or flag-on defaults
- [ ] Migration execution against production
- [ ] Deployment / canary manifests
- [ ] Live Meta HTTP in CI or runtime
- [ ] Legacy Instagram retirement
- [ ] Private reply OAuth path (2F)
- [ ] OAuth UI / webhook / refresh scheduler changes
- [ ] Destructive migration or mandatory backfill
- [ ] Credential/token material in queue payload

---

## 2. Queue binding contract

Reference: `instagramOAuthOutboundQueueContract.ts`, `instagramOAuthOutboundContract.ts`.

- [ ] `CONNECTION_BOUND` shape: `{ mode, contractVersion: 1, provider: INSTAGRAM, authFamily: INSTAGRAM_BUSINESS_LOGIN, deliveryPath: DATABASE_ONLY, channelConnectionId }`
- [ ] `LEGACY` shape: `{ mode: "LEGACY" }` only
- [ ] Prohibited fields absent (tokens, ciphertext, raw provider response, Authorization header, etc.)
- [ ] Unknown `contractVersion` fails closed
- [ ] Binding derived from DB at enqueue — not from client request body
- [ ] `authFamily` / `deliveryPath` not client-overridable
- [ ] `serializeInstagramCredentialBindingForQueue` or equivalent used for persistence
- [ ] Safe JSON helper strips secrets before outbox write

### Binding field matrix

| Field | Enqueue source | Worker check |
| --- | --- | --- |
| `tenantId` | Payload + DB | Matches message/conversation tenant |
| `channelConnectionId` | Conversation + OAuth credential join | Exact resolver input |
| `authFamily` | DB credential row | Literal `INSTAGRAM_BUSINESS_LOGIN` |
| `deliveryPath` | Policy | Literal `DATABASE_ONLY` |
| `messageKind` | `messageType` | TEXT → text service; IMAGE → image service |
| `conversationId` / `messageId` | RPC | Idempotency + terminal guard |

---

## 3. Routing decision matrix

- [ ] LINE jobs → LINE adapter only
- [ ] Facebook jobs → Facebook adapter only
- [ ] Instagram + absent binding → legacy `InstagramAdapter`
- [ ] Instagram + `{ mode: "LEGACY" }` → legacy adapter only
- [ ] Instagram + CONNECTION_BOUND + text flags → OAuth text service only
- [ ] Instagram + CONNECTION_BOUND + image flags → OAuth image service only
- [ ] Instagram + CONNECTION_BOUND + wrong/missing flags → fail closed (not legacy)
- [ ] Instagram + invalid binding → fail closed (not legacy, not OAuth)
- [ ] OAuth failure → **no** legacy fallback
- [ ] Legacy failure → **no** OAuth fallback
- [ ] Ambiguous binding → neither path invoked
- [ ] Private reply → legacy private-reply path only (not OAuth DM services)
- [ ] Unsupported message kind on OAuth path → terminal fail closed

---

## 4. Legacy compatibility

- [ ] Old jobs without binding field deserialize and run legacy path
- [ ] Explicit `{ mode: "LEGACY" }` preserved
- [ ] `DB_WITH_ENV_FALLBACK` not used when OAuth binding present
- [ ] Non-Instagram channels unchanged (LINE, Facebook)
- [ ] No automatic legacy-to-OAuth migration in worker
- [ ] No destructive backfill of queue/outbox rows
- [ ] Empty/invalid object cannot become CONNECTION_BOUND (zod strict)

---

## 5. Historical null-binding risk

- [ ] Conversation with null `channel_connection_id` cannot emit OAuth binding
- [ ] Worker fails closed if OAuth expected but binding missing
- [ ] No tenant-wide credential lookup
- [ ] No "first active Instagram connection" heuristic
- [ ] Sanitized operator error (no token, no full URLs)
- [ ] Historical remediation/backfill deferred unless explicitly scoped and reviewed

---

## 6. Feature flags

Expected:

```text
HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED
```

- [ ] FOUNDATION absent = OFF
- [ ] RUNTIME absent = OFF
- [ ] WORKER_ROUTING absent = OFF
- [ ] OUTBOUND_TEXT required for OAuth text worker path (in addition to above)
- [ ] OUTBOUND_IMAGE required for OAuth image worker path (in addition to above)
- [ ] WORKER_ROUTING does not enable text/image alone
- [ ] OUTBOUND_TEXT does not enable image
- [ ] OUTBOUND_IMAGE does not enable text
- [ ] No production env values in PR

---

## 7. Enqueue / API layer

- [ ] OAuth-managed connection detected from DB (not client flag)
- [ ] Exact `channel_connection_id` on conversation required before OAuth binding emission
- [ ] Wrong tenant / connection rejected
- [ ] Client cannot override `instagramCredentialBinding` in request
- [ ] Outbox payload includes binding only when appropriate
- [ ] RPC/schema changes additive and backward compatible
- [ ] `schema.sql` updated if migration added

---

## 8. Worker / use-case routing

- [ ] Binding parsed with `parseInstagramCredentialBindingFromPayload`
- [ ] Text route calls `resolveForDelivery` with binding's `channelConnectionId`
- [ ] Image route calls `resolveForDelivery` with binding's `channelConnectionId`
- [ ] IGSID derived from `channelThreadId` (`ig:user:{IGSID}`)
- [ ] Legacy route unchanged for non-OAuth jobs
- [ ] Wrong-path spies: legacy not called on OAuth success; OAuth not called on legacy success
- [ ] Invalid binding: provider/services not called

---

## 9. Idempotency and retry

- [ ] Idempotency scope `${tenantId}:${messageId}` preserved
- [ ] Processed skip does not re-send when snapshot terminal
- [ ] SENT + `external_message_id` prevents duplicate provider call
- [ ] Binding identical on retry (same job payload)
- [ ] OAuth provider clients do not internal-retry (regression)
- [ ] `assertOutboundMessageTerminalForQueueDone` before `markDone`
- [ ] Terminal errors → markDone when message FAILED
- [ ] Retryable errors → `markFailed` with backoff; not infinite loop
- [ ] Provider success + DB persist failure → existing retry policy (unchanged or tested amendment)
- [ ] Concurrent claim protected (`claim_queue_jobs`)

---

## 10. Retry/error mapping

- [ ] Worker routing disabled → terminal / feature disabled
- [ ] Missing/invalid binding → terminal configuration
- [ ] REAUTH_REQUIRED / expired / revoked → terminal, no unsafe credential mutation
- [ ] Rate limit / 5xx / timeout → retryable
- [ ] Provider contract / media / URL errors → terminal
- [ ] `last_error_preview` sanitized — no token, no signed URL query, no raw provider body
- [ ] Unknown 4xx not retried indefinitely

---

## 11. Secret/logging safety

Forbidden in payload/logs/audit/preview:

- [ ] Access token / Bearer
- [ ] Ciphertext / app secret
- [ ] Raw provider response
- [ ] Full signed image URL query
- [ ] Authorization header

Allowed:

- [ ] Stable error codes, retryability, message kind, binding mode, masked IDs

---

## 12. DB/RPC migration (if present)

- [ ] Additive only
- [ ] `schema.sql` parity
- [ ] Legacy callers unaffected
- [ ] No secret columns in queue/outbox tables
- [ ] No production migration execution in PR
- [ ] No mandatory data backfill without explicit review

**BLOCKED:** destructive DDL, credential in JSON payload, breaking RPC for legacy callers.

---

## 13. Worker isolation

- [ ] `instagramOAuthTextDelivery` not imported in production path unless flags + binding allow
- [ ] `instagramOAuthImageDelivery` not imported unless flags + binding allow
- [ ] Legacy worker boot unchanged for default-OFF flags
- [ ] OAuth text/image unit tests still pass (foundations unchanged except wiring)

---

## 14. Test matrix — binding/enqueue

- [ ] OAuth text binding emitted for OAuth-managed DM text
- [ ] OAuth image binding emitted for OAuth-managed DM image
- [ ] Exact `channelConnectionId` in binding matches conversation
- [ ] Wrong tenant rejected
- [ ] Missing connection rejected
- [ ] Client override ignored/rejected
- [ ] Legacy job without binding unchanged
- [ ] Null historical `channel_connection_id` fail closed for OAuth

---

## 15. Test matrix — worker routing

- [ ] WORKER_ROUTING OFF → OAuth binding jobs fail closed
- [ ] OUTBOUND_TEXT OFF → text OAuth job fail closed
- [ ] OUTBOUND_IMAGE OFF → image OAuth job fail closed
- [ ] All gates ON → OAuth text success (mocked provider)
- [ ] All gates ON → OAuth image success (mocked provider)
- [ ] Legacy job → legacy adapter success
- [ ] Ambiguous binding → fail closed, no provider call
- [ ] Unsupported kind → terminal, no provider call

---

## 16. Test matrix — idempotency/retry

- [ ] DONE job not re-sent
- [ ] `external_message_id` persisted on success
- [ ] Retryable failure retries with same binding
- [ ] Terminal failure stops retry loop
- [ ] Sanitized error strings in failure paths

---

## 17. Regression

- [ ] LINE outbound unchanged
- [ ] Facebook outbound unchanged
- [ ] Legacy Instagram text/image unchanged
- [ ] Instagram private reply unchanged
- [ ] Webhooks unchanged
- [ ] OAuth text/image service unit tests pass
- [ ] Outbox relay unchanged except payload shape extension

---

## 18. Production boundary

- [ ] No production flag enablement
- [ ] No deployment/canary
- [ ] No live Meta send
- [ ] Docs/report state: **2E.3 wiring ≠ production OAuth delivery**

Required wording:

> OAuth worker/queue binding foundation merged. Production enablement and live verification remain deferred.

Do **not** claim: production ready, live send verified, end-to-end complete, worker cutover complete in production, queue routing live, production flag enabled.

---

## 19. Verdict rubric

| Verdict | Criteria |
| --- | --- |
| **PASS** | Safe binding; correct routing; no fallback violations; flags OFF; idempotency intact; legacy compat; tests cover negative paths |
| **PASS WITH NOTES** | Minor non-blocking gaps |
| **CHANGES REQUESTED** | Client binding; OAuth→legacy fallback; weak validation; missing tests |
| **BLOCKED** | Secrets in queue; production cutover; live send; destructive migration |

---

## Remaining deferred work

| Phase | Scope |
| --- | --- |
| IG-AUTH-2E.4+ | Staging / live provider smoke |
| IG-AUTH-2E.7 | Production canary (explicit operator GO) |
| IG-AUTH-2F | Private reply OAuth |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |
| Historical backfill | Null `channel_connection_id` remediation (if needed) |

---

## Review record (fill on PR review)

| Field | Value |
| --- | --- |
| Implementation PR | |
| Reviewed SHA | |
| Review result | |
| Review comment URL | |
| Test evidence | |
| Agent B reviewer | |

---

## Merge sequencing note

2E.3 worker/queue wiring does not authorize production OAuth delivery. Production flag-on and live verification require separate review (2E.4+/2E.7).
