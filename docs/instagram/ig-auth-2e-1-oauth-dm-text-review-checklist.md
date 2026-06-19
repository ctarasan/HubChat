# IG-AUTH-2E.1 — OAuth DM Text Delivery Security Review Checklist

Finalized after PR #250 merge. Baseline: master `f355025`. Companion: [`ig-auth-2e-1b-security-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-1b-security-review-prep.md), [`ig-auth-2e-0-outbound-provider-contract.md`](ig-auth-2e-0-outbound-provider-contract.md).

**Merged scope:** OAuth DM text provider client + application service foundation, mocked tests, default-OFF flags. **Still deferred:** worker wire, queue binding, image, private reply, UI, live provider calls.

---

## 1. Scope gate

### Allowed (merged)

- OAuth Instagram text send provider client (graph.instagram.com)
- Text payload builder / validator
- Application service with resolved OAuth credential + IGSID + text
- Unit/integration tests with mocked HTTP
- Error taxonomy mapping for text send
- `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` (default OFF)
- Agent A implementation report citing official Meta docs

### Forbidden — verified absent

- [x] Image/media send (2E.2)
- [x] Private reply / comment_id recipient (2F)
- [x] Worker/outboundWorker wiring
- [x] Outbox/RPC queue binding emission (2E.3)
- [x] `sendOutboundMessage.ts` production path cutover
- [x] Channel Settings OAuth UI
- [x] Webhook changes
- [x] Token refresh scheduler
- [x] Legacy credential retirement
- [x] Production env values or flag-on defaults
- [x] Live Meta HTTP calls in CI or runtime
- [x] Schema/migration changes
- [x] `graph.facebook.com` for OAuth text send

---

## 2. Provider endpoint correctness

Official source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)

- [x] Host is `graph.instagram.com` only
- [x] Path is `POST /{version}/{IG_ID}/messages` (explicit professional account ID)
- [x] API version from central config
- [x] Token via `Authorization: Bearer` header only
- [x] No `access_token` query parameter on OAuth send URL
- [x] Content-Type `application/json`
- [x] Text body matches `{ recipient: { id }, message: { text } }`
- [x] Agent report links official doc with check date

---

## 3. ID semantics

- [x] Recipient is `InstagramMessagingScopedUserId` / IGSID
- [x] Sender path uses `InstagramProfessionalAccountId` from credential
- [x] `InstagramOAuthProviderUserId` not used as recipient
- [x] Username never used as routing key
- [x] Facebook Page ID not in OAuth URL path
- [x] PSID not accepted as Instagram recipient
- [x] Professional account ID rejected if passed as recipient (test)

---

## 4. Exact channel_connection_id binding

- [x] Service API requires `channelConnectionId`
- [x] Resolver invoked with exact `tenantId` + `channelConnectionId`
- [x] No tenant-global Instagram credential lookup
- [x] No "first active connection" heuristic
- [x] Missing connection ID fails closed before provider call

---

## 5. Resolver behavior

- [x] Uses `resolveForDelivery` with `INSTAGRAM_BUSINESS_LOGIN` + `DATABASE_ONLY`
- [x] ACTIVE and TOKEN_EXPIRING allowed per policy
- [x] REAUTH_REQUIRED, REVOKED, EXPIRED, DISCONNECTED fail closed
- [x] Decrypt path uses repository only — no ENV read
- [x] Returns access token + `providerInstagramAccountId` — not Page ID

---

## 6. Feature flags default OFF

- [x] `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` — absent = OFF
- [x] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` — absent = OFF
- [x] `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` — absent = OFF; requires all three for send
- [x] Text flag does not enable image/runtime/connect
- [x] No production env values in PR

---

## 7. No-fallback enforcement

- [x] Runtime flag OFF — fail closed
- [x] Outbound text flag OFF — fail closed
- [x] Missing `channelConnectionId` — fail closed
- [x] Resolver disabled — fail closed
- [x] Credential not found — fail closed
- [x] REAUTH_REQUIRED — fail closed
- [x] Token expired/revoked — fail closed
- [x] Invalid/missing IGSID — fail closed
- [x] OAuth provider error — no legacy retry

---

## 8. Text payload validation

- [x] Reject blank/whitespace-only text
- [x] Enforce UTF-8 byte length ≤ 1000
- [x] Reject empty recipient ID
- [x] No arbitrary client-supplied JSON keys in provider body
- [x] Username rejected as recipient

---

## 9. Provider response parsing

- [x] Success: require `message_id`; optional `recipient_id`
- [x] Malformed success JSON rejected
- [x] HTTP non-2xx mapped to taxonomy
- [x] Graph error codes parsed safely
- [x] No raw provider body in public errors

---

## 10. Error taxonomy

Verified codes include: `OAUTH_RUNTIME_DISABLED`, `OAUTH_OUTBOUND_TEXT_DISABLED`, `CHANNEL_CONNECTION_REQUIRED`, `CREDENTIAL_NOT_FOUND`, `REAUTH_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `PERMISSION_MISSING`, `RECIPIENT_UNAVAILABLE`, `MESSAGE_WINDOW_CLOSED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_CONTRACT_ERROR`, `DELIVERY_FAILED_RETRYABLE`, `DELIVERY_FAILED_TERMINAL`, `CONFIGURATION_AMBIGUOUS`.

- [x] Sanitized operator messages only
- [x] No stack traces to client

---

## 11. Secret-safe logging

- [x] No token in logs, errors, or test result snapshots
- [x] HTTP client does not log request headers
- [x] Provider response not persisted raw
- [x] Message text not exposed in public error paths

---

## 12. Worker / production cutover boundary

- [x] `worker/main.ts` unchanged — no text delivery import
- [x] `outboundWorker.ts` unchanged
- [x] `sendOutboundMessage.ts` unchanged
- [x] Outbox RPC unchanged
- [x] Mock fetch only in tests

---

## 13. Legacy regression

- [x] Legacy `InstagramAdapter` on `graph.facebook.com` unchanged
- [x] Worker regression guard tests present
- [x] No production OAuth text invocation path

---

## 14. Test quality (verified in PR #250)

### Provider client

- [x] Fixed endpoint host/path/version
- [x] Bearer header; no token in URL
- [x] Correct JSON payload shape
- [x] Malformed success rejected
- [x] 401 → REAUTH_REQUIRED
- [x] 429 retryable; 5xx/timeout retryable
- [x] Token not in error strings

### Application service

- [x] Flags OFF fail closed
- [x] Missing `channelConnectionId` fail closed
- [x] Resolver exact tenant + connection
- [x] ACTIVE and TOKEN_EXPIRING success paths
- [x] REAUTH_REQUIRED / expired / credential not found fail closed
- [x] Username and professional account ID rejected as recipient

### Regression

- [x] Worker/main isolation test
- [x] Full suite 2,201 pass

---

## 15. Deployment / production boundary

- [x] No production flag enablement
- [x] No env/config changes
- [x] No migration execution
- [x] No deployment/canary
- [x] Docs state: **2E.1 foundation ≠ production delivery**

---

## Final implementation review evidence

| Field | Value |
|-------|-------|
| Implementation PR | #250 |
| Merged status | merged |
| Merged master SHA | `f355025` |
| Reviewed implementation SHA | `0360424` |
| Review result | PASS |
| Review comment | https://github.com/ctarasan/HubChat/pull/250#issuecomment-4748294516 |
| Test evidence | 2,201/2,201 passed |
| Typecheck / Lint / Build | PASS |

---

## Production enablement boundary

PR #250 merge does **not** enable production OAuth DM delivery.

Still OFF / not performed:

- Worker/outbox production routing
- Queue binding emission
- Production flag-on
- Live Meta delivery verification
- Image/private-reply delivery
- Deployment

---

## Remaining deferred work

| Phase | Scope |
|-------|-------|
| IG-AUTH-2E.2 | OAuth image delivery |
| IG-AUTH-2E.3 | Queue binding + worker route |
| IG-AUTH-2E.7 | Production canary (explicit operator GO) |
| IG-AUTH-2F | Private reply |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |

---

## Verdict (final)

| Verdict | Result |
| --- | --- |
| **PASS** | OAuth text client correct; IDs separated; fail-closed; mocked tests; flags OFF; no worker/queue cutover — **confirmed at `0360424`** |

Documentation PR #249 ready for maintainer merge.

---

## Merge sequencing note

Queue binding (2E.3), worker route selection, and production canary (2E.7) require separate review after implementation.
