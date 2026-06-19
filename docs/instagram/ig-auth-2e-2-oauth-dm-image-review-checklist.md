# IG-AUTH-2E.2 — OAuth DM Image Delivery Security Review Checklist

Review prep for Agent A implementation PR. Baseline: master `f51c1ee` (post PR #250 text foundation). Companion: [`2026-06-19-ig-auth-2e-2b-image-security-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-2b-image-security-review-prep.md), [`ig-auth-2e-0-outbound-provider-contract.md`](ig-auth-2e-0-outbound-provider-contract.md), [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](ig-auth-2e-1-oauth-dm-text-review-checklist.md).

**Expected scope:** OAuth DM image provider client + application service foundation, mocked tests, default-OFF image flag. **Still deferred:** worker wire, queue binding, attachment upload cutover, caption policy, private reply, UI, live provider calls.

Official source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19).

---

## 1. Scope gate

### Allowed (expected in implementation PR)

- [ ] OAuth Instagram image send on `graph.instagram.com` (extend or parallel text client)
- [ ] Fixed image payload builder / validator
- [ ] Application service with resolved OAuth credential + IGSID + image URL (or documented attachment_id path)
- [ ] Unit/integration tests with mocked HTTP
- [ ] Error taxonomy mapping for image send
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` (default OFF)
- [ ] Agent A implementation report citing official Meta docs with check date

### Forbidden — must be absent

- [ ] Worker/outboundWorker wiring
- [ ] Outbox/RPC queue binding emission (2E.3)
- [ ] `sendOutboundMessage.ts` production path cutover
- [ ] Live Meta HTTP calls in CI or runtime
- [ ] Production env values or flag-on defaults
- [ ] Schema/migration changes
- [ ] `graph.facebook.com` for OAuth image send
- [ ] Page-token attachment upload without OAuth upload contract
- [ ] Private reply / `comment_id` recipient (2F)
- [ ] OAuth UI, webhook, refresh scheduler, legacy retirement, deployment

---

## 2. Provider endpoint correctness

**Do not assume image endpoint equals text endpoint without verifying payload shape differs from legacy.**

- [ ] Host is `graph.instagram.com` only
- [ ] Path is `POST /{version}/{IG_ID}/messages` (explicit professional account ID — same path as text, different body)
- [ ] API version from central config (not hard-coded)
- [ ] Token via `Authorization: Bearer` header only
- [ ] No `access_token` query parameter on send URL
- [ ] Content-Type `application/json`
- [ ] Image body matches **official Instagram Login** sample (not legacy Page adapter shape)
- [ ] Agent report links official doc section "Send Images" with check date
- [ ] Mocked test asserts exact serialized JSON body

### Endpoint approval gate

| Check | Pass criteria |
| --- | --- |
| API family | Instagram Login only |
| Wrong host | `graph.facebook.com` → **BLOCKED** |
| Page ID in path | → **BLOCKED** |
| Ambiguous payload | Unstated shape with runtime call → **CHANGES REQUESTED** |

---

## 3. Image payload contract

Official Instagram Login single-image sample uses `message.attachments` with `type: "image"` and `payload.url`. Legacy HubChat uses singular `message.attachment` on Facebook Graph — **must not be copied blindly**.

- [ ] Explicit payload builder function (no inline ad-hoc objects from caller)
- [ ] Recipient `{ id: <IGSID> }` only
- [ ] Attachment `type` is exactly `"image"` per official doc
- [ ] `payload.url` OR `payload.attachment_id` per documented chosen path — not both arbitrary
- [ ] No arbitrary key spread from input objects
- [ ] No caption/text field inside image payload (caption deferred unless explicit scope)
- [ ] No private-reply fields
- [ ] No legacy `messaging_type: "RESPONSE"` unless official Instagram Login doc requires it
- [ ] No Messenger-only fields (`platform`, templates, quick replies)
- [ ] Multi-image array out of scope unless PR explicitly claims and tests it

### Direct URL path

- [ ] HTTPS URL only at validation boundary
- [ ] Public reachability requirement documented (Meta fetches URL)
- [ ] Signed URL expiry risk documented if using Supabase signed URLs
- [ ] No server-side fetch of user URL to proxy image (Meta fetches)

### Attachment ID path (if present)

- [ ] Upload API family verified (OAuth vs Page token)
- [ ] Upload endpoint host/path documented with official citation
- [ ] Credential binding matches send path (`channel_connection_id`)
- [ ] Without OAuth upload docs → **BLOCKING_FOR_RUNTIME_CLIENT**

---

## 4. ID semantics

- [ ] Recipient is `InstagramMessagingScopedUserId` / IGSID
- [ ] Sender path uses `InstagramProfessionalAccountId` from credential
- [ ] `InstagramOAuthProviderUserId` not used as recipient
- [ ] Username never used as routing key
- [ ] Facebook Page ID not in OAuth URL path
- [ ] PSID not accepted as Instagram recipient
- [ ] Professional account ID rejected if passed as recipient (test)
- [ ] Branded types at compile time; runtime validation at service boundary

---

## 5. Exact channel_connection_id binding

- [ ] Service API requires `channelConnectionId`
- [ ] Resolver invoked with exact `tenantId` + `channelConnectionId`
- [ ] No tenant-global Instagram credential lookup
- [ ] No "first active connection" heuristic
- [ ] Missing connection ID fails closed before provider call

---

## 6. Resolver behavior

- [ ] Uses `resolveForDelivery` with `INSTAGRAM_BUSINESS_LOGIN` + `DATABASE_ONLY`
- [ ] ACTIVE and TOKEN_EXPIRING allowed per policy
- [ ] REAUTH_REQUIRED, REVOKED, EXPIRED, DISCONNECTED fail closed
- [ ] Decrypt path uses repository only — no ENV read
- [ ] Returns access token + `providerInstagramAccountId` — not Page ID

---

## 7. Feature flags default OFF

- [ ] `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` — absent = OFF
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` — absent = OFF
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` — absent = OFF; requires all three for image send
- [ ] Image flag does not enable text send
- [ ] Text flag does not enable image send
- [ ] No production env values in PR

---

## 8. No-fallback enforcement

- [ ] Runtime flag OFF — fail closed; provider not called
- [ ] Outbound image flag OFF — fail closed; provider not called
- [ ] Missing `channelConnectionId` — fail closed
- [ ] Invalid / non-HTTPS URL — fail closed
- [ ] Unsupported MIME / oversize — fail closed
- [ ] Resolver disabled — fail closed
- [ ] Credential not found — fail closed
- [ ] REAUTH_REQUIRED — fail closed
- [ ] Token expired/revoked — fail closed
- [ ] Invalid/missing IGSID — fail closed
- [ ] OAuth provider error — no legacy retry
- [ ] No fallback to legacy `InstagramAdapter`, Facebook adapter, ENV Page token, alternate connection, private reply, or text adapter

---

## 9. URL validation and SSRF controls

If service validates URL before send (recommended):

- [ ] HTTPS only; HTTP rejected
- [ ] localhost / 127.0.0.0/8 rejected
- [ ] Private RFC1918 rejected
- [ ] Link-local rejected
- [ ] IPv6 local/private rejected
- [ ] Embedded credentials in URL rejected
- [ ] Malformed URL rejected
- [ ] URL length bounded
- [ ] No server-side fetch of outbound URL (Meta fetches)
- [ ] If any fetch exists: `redirect: "manual"`, bounded size, timeout

Content restrictions:

- [ ] No profile/avatar URL as media source
- [ ] No Source Post / `MEDIA_SHARE` reuse
- [ ] No raw internal storage path without public HTTPS semantics
- [ ] MIME aligned with official png/jpeg (WEBP policy explicit if accepted)
- [ ] 8MB Meta cap enforced before provider call

---

## 10. Signed URL secrecy

- [ ] No full media URL in logs
- [ ] No query string (signed token) in operator errors
- [ ] No signed URL in audit events
- [ ] No raw provider payload snapshots persisted
- [ ] Test fixtures use placeholder URLs only (`https://cdn.example/...`)

---

## 11. Provider response parsing

- [ ] Success: require `message_id`; optional `recipient_id`
- [ ] Malformed success JSON rejected
- [ ] HTTP non-2xx mapped to taxonomy
- [ ] Graph error codes parsed safely (reuse 2E.1 mappings where applicable)
- [ ] No raw provider body in public errors

---

## 12. Error taxonomy

Expected codes (extend 2E.1 set as needed):

`OAUTH_RUNTIME_DISABLED`, `OAUTH_OUTBOUND_IMAGE_DISABLED`, `CHANNEL_CONNECTION_REQUIRED`, `CREDENTIAL_NOT_FOUND`, `REAUTH_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `PERMISSION_MISSING`, `RECIPIENT_UNAVAILABLE`, `MESSAGE_WINDOW_CLOSED`, `INVALID_MEDIA_URL`, `UNSUPPORTED_MEDIA`, `MEDIA_TOO_LARGE`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_CONTRACT_ERROR`, `DELIVERY_FAILED_RETRYABLE`, `DELIVERY_FAILED_TERMINAL`, `CONFIGURATION_AMBIGUOUS`.

| Condition | Expected |
| --- | --- |
| Invalid URL | Terminal |
| Unsupported MIME | Terminal |
| Media too large | Terminal |
| 401 / code 190 | REAUTH_REQUIRED |
| 429 | Retryable |
| 5xx / timeout | Retryable |
| Malformed success | PROVIDER_CONTRACT_ERROR |

- [ ] Sanitized operator messages only
- [ ] No stack traces to client
- [ ] Provider client does not internally retry image send

---

## 13. Worker / production cutover boundary

- [ ] `worker/main.ts` unchanged — no image delivery import
- [ ] `outboundWorker.ts` unchanged
- [ ] `sendOutboundMessage.ts` unchanged
- [ ] Outbox RPC unchanged
- [ ] Mock fetch only in tests

---

## 14. Legacy regression

- [ ] Legacy `InstagramAdapter` on `graph.facebook.com` unchanged
- [ ] OAuth text delivery service/client unchanged (tests still pass)
- [ ] Facebook / LINE adapters unchanged
- [ ] Private reply path unchanged
- [ ] Webhook unchanged
- [ ] Worker regression guard tests present or extended

---

## 15. Test quality (expected in implementation PR)

### Provider client

- [ ] Fixed endpoint host/path/version
- [ ] Bearer header; no token in URL
- [ ] Correct JSON payload shape per official doc (not legacy)
- [ ] Malformed success rejected
- [ ] 401 → REAUTH_REQUIRED
- [ ] 429 retryable; 5xx/timeout retryable
- [ ] Token not in error strings
- [ ] URL not in error strings (signed query redacted)

### URL / security tests

- [ ] Valid HTTPS accepted
- [ ] HTTP / localhost / private / link-local rejected
- [ ] Embedded credentials rejected
- [ ] Oversized URL rejected

### Application service

- [ ] Image flags OFF fail closed
- [ ] Missing `channelConnectionId` fail closed
- [ ] Resolver exact tenant + connection
- [ ] ACTIVE and TOKEN_EXPIRING success paths
- [ ] REAUTH_REQUIRED / expired / credential not found fail closed
- [ ] Username and professional account ID rejected as recipient
- [ ] Provider mock not called on precondition failure

### Regression

- [ ] OAuth text tests unchanged/passing
- [ ] Full suite pass count recorded in Agent A report

---

## 16. Deployment / production boundary

- [ ] No production flag enablement
- [ ] No env/config production changes
- [ ] No migration execution
- [ ] No deployment/canary
- [ ] Docs state: **2E.2 foundation ≠ production image delivery**

### Production boundary wording (required)

Use:

> OAuth DM image provider/application foundation merged. Production worker/outbox cutover and live verification remain deferred.

Do **not** claim:

- production ready
- live DM image verified
- end-to-end outbound complete
- worker cutover complete
- queue routing complete
- production flag enabled

---

## 17. Endpoint ambiguity tracker

| Topic | Status | PR must address |
| --- | --- | --- |
| Single-image key: `attachments` vs `attachment` | NEEDS_PROVIDER_CONFIRMATION | Cite official sample + mock assertion |
| OAuth attachment upload API | NEEDS_PROVIDER_CONFIRMATION | Defer or document OAuth upload endpoint |
| WEBP at OAuth boundary | NEEDS_PROVIDER_CONFIRMATION | Reject or document |
| Caption on image | Deferred | No unsupported payload fields |
| `messaging_type` | Not in Instagram Login samples | Do not copy from legacy |

---

## 18. Verdict rubric

| Verdict | Criteria |
| --- | --- |
| **PASS** | Official endpoint; correct IDs; fixed payload; URL security; image flag OFF; no fallback; mocked tests; scope clean |
| **PASS WITH NOTES** | Minor doc/test gaps non-blocking |
| **CHANGES REQUESTED** | Wrong payload; Page API leak; missing validation; legacy fields |
| **BLOCKED** | graph.facebook.com OAuth path; production cutover; live Meta; fallback; secrets |

---

## Remaining deferred work

| Phase | Scope |
| --- | --- |
| IG-AUTH-2E.3 | Queue binding + worker route |
| IG-AUTH-2E.4+ | Security review, staging, production canary |
| IG-AUTH-2E.7 | Production canary (explicit operator GO) |
| IG-AUTH-2F | Private reply |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |
| Caption policy | Separate text send or future slice |
| Attachment upload | OAuth-native upload if distinct from Page API |

---

## Merge sequencing note

Queue binding (2E.3), worker route selection, and production canary (2E.7) require separate review after implementation. Image foundation (2E.2) does not authorize production enablement.

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
