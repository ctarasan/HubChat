# IG-AUTH-2E.3 — Worker/Queue OAuth Routing Security Review Checklist

Finalized after PR #254 merge. Baseline: master `43b98fb`. Companion: [`2026-06-19-ig-auth-2e-3b-worker-routing-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-3b-worker-routing-review-prep.md), [`2026-06-19-ig-auth-2e-0-outbound-contract-audit.md`](../agent-a/2026-06-19-ig-auth-2e-0-outbound-contract-audit.md).

**Merged scope:** Versioned persisted OAuth queue binding, worker controlled OAuth text/image routing, additive RPC/migration, default-OFF worker routing flag, mocked/integration tests. **Still deferred:** production flag-on, production migration execution, live Meta send, deployment, legacy retirement, private reply OAuth, OAuth UI.

---

## 1. Scope gate

### Allowed (merged)

- [x] `instagramCredentialBinding` emission at enqueue (CONNECTION_BOUND for OAuth-managed connections)
- [x] Additive RPC/outbox payload extension (`p_instagram_credential_binding jsonb default null`)
- [x] Worker/use-case routing to `instagramOAuthTextDelivery` / `instagramOAuthImageDelivery`
- [x] `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` (default OFF)
- [x] Binding parse/validate at worker boundary (reuse IG-AUTH-2B contract)
- [x] Tests: enqueue, routing, idempotency, legacy regression
- [x] Agent A implementation report

### Forbidden — verified absent

- [x] Production env values or flag-on defaults
- [x] Migration execution against production
- [x] Deployment / canary manifests
- [x] Live Meta HTTP in CI or runtime
- [x] Legacy Instagram retirement
- [x] Private reply OAuth path (2F)
- [x] OAuth UI / webhook / refresh scheduler changes
- [x] Destructive migration or mandatory backfill
- [x] Credential/token material in queue payload

---

## 2. Queue binding contract

Reference: `instagramOAuthOutboundQueueContract.ts`, `instagramOAuthOutboundContract.ts`.

- [x] `CONNECTION_BOUND` shape: `{ mode, contractVersion: 1, provider: INSTAGRAM, authFamily: INSTAGRAM_BUSINESS_LOGIN, deliveryPath: DATABASE_ONLY, channelConnectionId, messageKind }`
- [x] `LEGACY` shape: `{ mode: "LEGACY" }` only
- [x] Prohibited fields absent (tokens, ciphertext, raw provider response, Authorization header, etc.)
- [x] Unknown `contractVersion` fails closed
- [x] Binding derived from DB at enqueue — not from client request body
- [x] `authFamily` / `deliveryPath` not client-overridable
- [x] `serializeInstagramCredentialBindingForQueue` used for persistence
- [x] Safe JSON helper strips secrets before outbox write

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

- [x] LINE jobs → LINE adapter only
- [x] Facebook jobs → Facebook adapter only
- [x] Instagram + absent binding → legacy `InstagramAdapter`
- [x] Instagram + `{ mode: "LEGACY" }` → legacy adapter only
- [x] Instagram + CONNECTION_BOUND + text flags → OAuth text service only
- [x] Instagram + CONNECTION_BOUND + image flags → OAuth image service only
- [x] Instagram + CONNECTION_BOUND + wrong/missing flags → fail closed (not legacy)
- [x] Instagram + invalid binding → fail closed (not legacy, not OAuth)
- [x] OAuth failure → **no** legacy fallback
- [x] Legacy failure → **no** OAuth fallback
- [x] Ambiguous binding → neither path invoked
- [x] Private reply → legacy private-reply path only (not OAuth DM services)
- [x] Unsupported message kind on OAuth path → terminal fail closed

---

## 4. Legacy compatibility

- [x] Old jobs without binding field deserialize and run legacy path
- [x] Explicit `{ mode: "LEGACY" }` preserved
- [x] `DB_WITH_ENV_FALLBACK` not used when OAuth binding present
- [x] Non-Instagram channels unchanged (LINE, Facebook)
- [x] No automatic legacy-to-OAuth migration in worker
- [x] No destructive backfill of queue/outbox rows
- [x] Empty/invalid object cannot become CONNECTION_BOUND (zod strict)

---

## 5. Historical null-binding behavior

- [x] Conversation with null `channel_connection_id` cannot emit OAuth binding when OAuth-only tenant
- [x] Worker fails closed if OAuth expected but binding missing/invalid
- [x] No tenant-wide credential lookup for OAuth enqueue
- [x] No "first active Instagram connection" heuristic
- [x] Sanitized operator error (no token, no full URLs)
- [x] Historical null-binding remediation/backfill remains separate deferred work

---

## 6. Feature flags

Expected:

```text
HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED
```

- [x] FOUNDATION absent = OFF
- [x] RUNTIME absent = OFF
- [x] WORKER_ROUTING absent = OFF
- [x] OUTBOUND_TEXT required for OAuth text worker path (in addition to above)
- [x] OUTBOUND_IMAGE required for OAuth image worker path (in addition to above)
- [x] WORKER_ROUTING does not enable text/image alone
- [x] OUTBOUND_TEXT does not enable image
- [x] OUTBOUND_IMAGE does not enable text
- [x] No production env values in PR #254

---

## 7. Enqueue / API layer

- [x] OAuth-managed connection detected from DB (not client flag)
- [x] Exact `channel_connection_id` on conversation required before OAuth binding emission
- [x] Wrong tenant / connection rejected
- [x] Client cannot override `instagramCredentialBinding` in request
- [x] Outbox payload includes binding only when appropriate
- [x] RPC/schema changes additive and backward compatible
- [x] `schema.sql` updated with migration

---

## 8. Worker / use-case routing

- [x] Binding parsed with `parseInstagramCredentialBindingFromPayload`
- [x] Text route calls OAuth text service with binding's `channelConnectionId`
- [x] Image route calls OAuth image service with binding's `channelConnectionId`
- [x] IGSID derived from `channelThreadId` (`ig:user:{IGSID}`)
- [x] Legacy route unchanged for non-OAuth jobs
- [x] Wrong-path spies: legacy not called on OAuth success; OAuth not called on legacy success
- [x] Invalid binding: provider/services not called

---

## 9. Idempotency and retry

- [x] Idempotency scope `${tenantId}:${messageId}` preserved
- [x] Processed skip does not re-send when snapshot terminal
- [x] SENT + `external_message_id` prevents duplicate provider call
- [x] Binding identical on retry (same job payload)
- [x] OAuth provider clients do not internal-retry (regression)
- [x] `assertOutboundMessageTerminalForQueueDone` before `markDone`
- [x] Terminal errors → markDone when message FAILED
- [x] Retryable errors → `markFailed` with backoff; not infinite loop
- [x] Provider success + DB persist failure → existing retry policy preserved
- [x] Concurrent claim protected (`claim_queue_jobs`)
- [x] Routing occurs after successful atomic claim

---

## 10. Retry/error mapping

- [x] Worker routing disabled → terminal / feature disabled
- [x] Missing/invalid binding → terminal configuration
- [x] REAUTH_REQUIRED / expired / revoked → terminal, no unsafe credential mutation
- [x] Rate limit / 5xx / timeout → retryable
- [x] Provider contract / media / URL errors → terminal
- [x] `last_error_preview` sanitized — no token, no signed URL query, no raw provider body
- [x] Unknown 4xx not retried indefinitely

---

## 11. Secret/logging safety

Forbidden in payload/logs/audit/preview:

- [x] Access token / Bearer — absent
- [x] Ciphertext / app secret — absent
- [x] Raw provider response — absent
- [x] Full signed image URL query — absent
- [x] Authorization header — absent

Allowed:

- [x] Stable error codes, retryability, message kind, binding mode, masked IDs

---

## 12. DB/RPC migration

- [x] Additive only
- [x] `schema.sql` parity
- [x] Legacy callers unaffected
- [x] No secret columns in queue/outbox tables
- [x] No production migration execution in PR
- [x] No mandatory data backfill

---

## 13. Worker isolation

- [x] `instagramOAuthTextDelivery` wired in worker with flag + binding gates
- [x] `instagramOAuthImageDelivery` wired in worker with flag + binding gates
- [x] Legacy worker path unchanged for default-OFF flags
- [x] OAuth text/image unit tests still pass

---

## 14. Test matrix — binding/enqueue

- [x] OAuth text binding emitted for OAuth-managed DM text
- [x] OAuth image binding emitted for OAuth-managed DM image
- [x] Exact `channelConnectionId` in binding matches conversation
- [x] Wrong tenant rejected
- [x] Missing connection rejected
- [x] Client override ignored/rejected
- [x] Legacy job without binding unchanged
- [x] Null historical `channel_connection_id` fail closed for OAuth-only tenant

---

## 15. Test matrix — worker routing

- [x] WORKER_ROUTING OFF → OAuth binding jobs fail closed
- [x] OUTBOUND_TEXT OFF → text OAuth job fail closed
- [x] OUTBOUND_IMAGE OFF → image OAuth job fail closed
- [x] All gates ON → OAuth text success (mocked provider)
- [x] All gates ON → OAuth image success (mocked provider)
- [x] Legacy job → legacy adapter success
- [x] Ambiguous binding → fail closed, no provider call
- [x] Unsupported kind → terminal, no provider call

---

## 16. Test matrix — idempotency/retry

- [x] DONE job not re-sent (existing idempotency policy preserved)
- [x] `external_message_id` persisted on success
- [x] Retryable failure retries with same binding
- [x] Terminal failure stops retry loop
- [x] Sanitized error strings in failure paths

---

## 17. Regression

- [x] LINE outbound unchanged
- [x] Facebook outbound unchanged
- [x] Legacy Instagram text/image unchanged
- [x] Instagram private reply unchanged
- [x] Webhooks unchanged
- [x] OAuth text/image service unit tests pass
- [x] Outbox relay unchanged except payload shape extension

---

## 18. Production boundary

- [x] No production flag enablement
- [x] No deployment/canary
- [x] No live Meta send
- [x] Docs/report state: **2E.3 wiring merged ≠ production OAuth delivery**

Required wording:

> Worker/queue integration is merged in code behind default-OFF gates. Production migration execution, feature-flag enablement, live delivery, and canary remain deferred.

Do **not** claim: production ready, live send verified, end-to-end complete, worker cutover complete in production, queue routing live, production flag enabled.

---

## 19. Verdict rubric

| Verdict | Criteria |
| --- | --- |
| **PASS** | Safe binding; correct routing; no fallback violations; flags OFF; idempotency intact; legacy compat; tests cover negative paths |
| **PASS WITH NOTES** | Minor non-blocking gaps |
| **CHANGES REQUESTED** | Client binding; OAuth→legacy fallback; weak validation; missing tests |
| **BLOCKED** | Secrets in queue; production cutover; live send; destructive migration |

**PR #254 review result:** PASS

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

## Review record

| Field | Value |
| --- | --- |
| Implementation PR | #254 |
| Reviewed SHA | `6041082d468ea8f0c4e95d7650aeba549bbc1083` |
| Merged master SHA | `43b98fb7b1f2636c5a1580e92693e8512b35ccb2` |
| Review result | **PASS** |
| Review comment URL | https://github.com/ctarasan/HubChat/pull/254#issuecomment-4748741341 |
| Test evidence | 35 targeted tests pass; 2255 full suite pass; typecheck/lint/build pass |
| Agent B reviewer | Agent B (independent review) |
| Post-merge doc alignment | This commit |

---

## Merge sequencing note

2E.3 worker/queue wiring merged in code does not authorize production OAuth delivery. Production migration execution, flag enablement, and live verification require separate review (2E.4+/2E.7).
