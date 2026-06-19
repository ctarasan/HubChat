# IG-AUTH-2E.2 — OAuth DM Image Delivery Security Review Checklist

Finalized after PR #252 merge. Baseline: master `a84cf78`. Companion: [`2026-06-19-ig-auth-2e-2b-image-security-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-2b-image-security-review-prep.md), [`ig-auth-2e-0-outbound-provider-contract.md`](ig-auth-2e-0-outbound-provider-contract.md), [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](ig-auth-2e-1-oauth-dm-text-review-checklist.md).

**Merged scope:** OAuth DM image provider client + application service foundation, mocked tests, default-OFF image flag. **Still deferred:** worker wire, queue binding, attachment upload, live Meta image send, private reply, UI, deployment.

Official source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19).

---

## 1. Scope gate

### Allowed (merged)

- [x] OAuth Instagram image send on `graph.instagram.com` (extends text client)
- [x] Fixed image payload builder / validator
- [x] Application service with resolved OAuth credential + IGSID + image URL
- [x] Unit/integration tests with mocked HTTP
- [x] Error taxonomy mapping for image send
- [x] `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` (default OFF)
- [x] Agent A implementation report citing official Meta docs

### Forbidden — verified absent

- [x] Worker/outboundWorker wiring
- [x] Outbox/RPC queue binding emission (2E.3)
- [x] `sendOutboundMessage.ts` production path cutover
- [x] Live Meta HTTP calls in CI or runtime
- [x] Production env values or flag-on defaults
- [x] Schema/migration changes
- [x] `graph.facebook.com` for OAuth image send
- [x] Page-token attachment upload
- [x] Private reply / `comment_id` recipient (2F)
- [x] OAuth UI, webhook, refresh scheduler, legacy retirement, deployment

---

## 2. Provider endpoint correctness

- [x] Host is `graph.instagram.com` only
- [x] Path is `POST /{version}/{IG_ID}/messages` (explicit professional account ID)
- [x] API version from central config
- [x] Token via `Authorization: Bearer` header only
- [x] No `access_token` query parameter on send URL
- [x] Content-Type `application/json`
- [x] Image body uses fixed builder with Instagram Login host (not legacy Page adapter)
- [x] Agent report links official doc section "Send Images"
- [x] Mocked test asserts exact serialized JSON body

---

## 3. Image payload contract

Merged implementation uses singular `message.attachment` with `type: "image"` and `payload.url` (direct HTTPS URL). Official single-image sample uses `attachments` key — live provider confirmation deferred.

- [x] Explicit payload builder (`buildInstagramOAuthImageMessagePayload`)
- [x] Recipient `{ id: <IGSID> }` only
- [x] Attachment `type` is exactly `"image"`
- [x] `payload.url` only (attachment_id deferred)
- [x] No arbitrary key spread from caller input
- [x] No caption/text field inside image payload
- [x] No private-reply fields
- [x] No legacy `messaging_type: "RESPONSE"`
- [x] No Messenger-only fields
- [x] Multi-image array out of scope

### Direct URL path

- [x] HTTPS URL only at validation boundary
- [x] Public reachability documented (Meta fetches URL; HubChat does not server-fetch)
- [x] Signed URL expiry risk documented in Agent A report
- [x] No server-side fetch of user URL

### Attachment ID path

- [x] Not implemented — deferred (no Page-token upload path)

---

## 4. ID semantics

- [x] Recipient is `InstagramMessagingScopedUserId` / IGSID
- [x] Sender path uses `InstagramProfessionalAccountId` from credential
- [x] `InstagramOAuthProviderUserId` not used as recipient
- [x] Username never used as routing key
- [x] Facebook Page ID not in OAuth URL path
- [x] PSID not accepted as Instagram recipient
- [x] Professional account ID rejected if passed as recipient (test)
- [x] Runtime validation at service boundary

---

## 5. Exact channel_connection_id binding

- [x] Service API requires `channelConnectionId`
- [x] Resolver invoked with exact `tenantId` + `channelConnectionId`
- [x] No tenant-global Instagram credential lookup
- [x] No "first active connection" heuristic
- [x] Missing connection ID fails closed before provider call

---

## 6. Resolver behavior

- [x] Uses `resolveForDelivery` with `INSTAGRAM_BUSINESS_LOGIN` + `DATABASE_ONLY`
- [x] ACTIVE and TOKEN_EXPIRING allowed per policy
- [x] REAUTH_REQUIRED, REVOKED, EXPIRED, DISCONNECTED fail closed
- [x] Decrypt path uses repository only — no ENV read
- [x] Returns access token + `providerInstagramAccountId` — not Page ID

---

## 7. Feature flags default OFF

- [x] `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` — absent = OFF
- [x] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` — absent = OFF
- [x] `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` — absent = OFF; requires all three
- [x] Image flag does not enable text send
- [x] Text flag does not enable image send
- [x] No production env values in PR

---

## 8. No-fallback enforcement

- [x] Runtime flag OFF — fail closed; provider not called
- [x] Outbound image flag OFF — fail closed; provider not called
- [x] Missing `channelConnectionId` — fail closed
- [x] Invalid / non-HTTPS URL — fail closed (before resolver on invalid URL)
- [x] Unsupported MIME / oversize — fail closed
- [x] Resolver disabled — fail closed
- [x] Credential not found — fail closed
- [x] REAUTH_REQUIRED — fail closed
- [x] Token expired/revoked — fail closed
- [x] Invalid/missing IGSID — fail closed
- [x] OAuth provider error — no legacy retry
- [x] No fallback to legacy `InstagramAdapter`, Facebook adapter, ENV Page token, alternate connection, private reply, or text adapter

---

## 9. URL validation and media boundaries

Implementation validates URL structure and obvious local/private destinations. **Does not server-fetch the image.** Meta fetches the supplied URL.

- [x] HTTPS only; HTTP rejected
- [x] localhost / 127.0.0.0/8 rejected (via `isUnsafeMediaHost`)
- [x] Private RFC1918 rejected
- [ ] Link-local rejected — **not covered** by `isUnsafeMediaHost` (non-blocking; no server fetch)
- [ ] IPv6 local/private rejected — **not covered** (non-blocking; no server fetch)
- [x] Embedded credentials in URL rejected
- [x] Malformed URL rejected
- [x] URL length bounded (4096)
- [x] No server-side fetch of outbound URL

Content restrictions:

- [x] Profile/avatar/thumbnail path heuristic (defense-in-depth; not identity-grade)
- [x] No Source Post / `MEDIA_SHARE` reuse
- [x] MIME JPEG/PNG only on OAuth path (WEBP rejected)
- [x] 8MB Meta cap on declared `fileSizeBytes` when supplied (not remote size verification)

---

## 10. Signed URL secrecy

- [x] `maskInstagramOAuthImageUrlForLog` strips query and fragment
- [x] No query string in operator-facing validation errors
- [x] No signed URL in test error assertions
- [x] No raw provider payload snapshots persisted
- [x] Test fixtures use placeholder URLs (`https://cdn.example.test/...`)

---

## 11. Provider response parsing

- [x] Success: require `message_id`; optional `recipient_id`
- [x] Malformed success JSON rejected
- [x] HTTP non-2xx mapped to taxonomy
- [x] Graph error codes parsed safely (includes `UNSUPPORTED_MEDIA` for image)
- [x] No raw provider body in public errors

---

## 12. Error taxonomy

Verified codes include: `OAUTH_IMAGE_DISABLED`, `OAUTH_RUNTIME_DISABLED`, `CHANNEL_CONNECTION_REQUIRED`, `CREDENTIAL_NOT_FOUND`, `REAUTH_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `PERMISSION_MISSING`, `RECIPIENT_UNAVAILABLE`, `MESSAGE_WINDOW_CLOSED`, `IMAGE_URL_INVALID`, `UNSUPPORTED_MEDIA`, `MEDIA_TOO_LARGE`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_CONTRACT_ERROR`, `DELIVERY_FAILED_RETRYABLE`, `DELIVERY_FAILED_TERMINAL`, `CONFIGURATION_AMBIGUOUS`.

- [x] Sanitized operator messages only
- [x] No stack traces to client
- [x] Provider client does not internally retry image send

---

## 13. Worker / production cutover boundary

- [x] `worker/main.ts` unchanged — no image delivery import
- [x] `outboundWorker.ts` unchanged
- [x] `sendOutboundMessage.ts` unchanged
- [x] Outbox RPC unchanged
- [x] Mock fetch only in tests

---

## 14. Legacy regression

- [x] Legacy `InstagramAdapter` on `graph.facebook.com` unchanged
- [x] OAuth text delivery service/client unchanged (tests still pass)
- [x] Facebook / LINE adapters unchanged
- [x] Private reply path unchanged
- [x] Webhook unchanged
- [x] Worker regression guard tests present

---

## 15. Test quality (verified in PR #252)

### Provider client

- [x] Fixed endpoint host/path/version
- [x] Bearer header; no token in URL
- [x] Correct JSON payload shape asserted in mock
- [x] Malformed success rejected (shared with text)
- [x] 401 → REAUTH_REQUIRED
- [x] 429 retryable; 5xx retryable
- [x] Token not in error strings
- [x] Invalid media → UNSUPPORTED_MEDIA

### URL / security tests

- [x] Valid HTTPS accepted
- [x] HTTP / localhost / private rejected
- [x] Embedded credentials rejected
- [x] Oversized URL rejected
- [x] WEBP rejected at OAuth boundary
- [x] Signed query not in masked log output

### Application service

- [x] Image flags OFF fail closed
- [x] Missing `channelConnectionId` fail closed
- [x] Resolver exact tenant + connection
- [x] ACTIVE success path
- [x] REAUTH_REQUIRED fail closed
- [x] Provider mock not called on invalid URL
- [x] Worker/main isolation test

### Regression

- [x] OAuth text tests unchanged/passing
- [x] Full suite 2,230 pass

---

## 16. Deployment / production boundary

- [x] No production flag enablement
- [x] No env/config production changes
- [x] No migration execution
- [x] No deployment/canary
- [x] Docs state: **2E.2 foundation ≠ production image delivery**

### Production boundary wording (required)

> OAuth DM image provider/application foundation merged. Production worker/outbox cutover and live verification remain deferred.

Do **not** claim production image delivery ready, live image send verified, end-to-end complete, worker cutover complete, queue routing complete, or production flag enabled.

---

## 17. Endpoint ambiguity tracker (post-review)

| Topic | Status after PR #252 |
| --- | --- |
| Single-image key: `attachments` vs `attachment` | Merged: singular `attachment`; **live confirmation deferred** |
| OAuth attachment upload API | Deferred — direct URL only |
| WEBP at OAuth boundary | Rejected at OAuth validation |
| Caption on image | Deferred — no payload field |
| `/me/messages` equivalence | Deferred — explicit `/{IG_ID}/messages` used |

---

## Final implementation review evidence

| Field | Value |
| --- | --- |
| Implementation PR | #252 |
| Merged status | merged |
| Merged master SHA | `a84cf78` |
| Reviewed implementation SHA | `16ca75b` |
| Review result | **PASS WITH NOTES** |
| Review comment | https://github.com/ctarasan/HubChat/pull/252#issuecomment-4748463640 |
| Test evidence | 2,230/2,230 passed |
| Typecheck / Lint / Build | PASS |

### Non-blocking review notes

- Singular `message.attachment` vs official single-image `attachments` sample — live smoke deferred
- `isUnsafeMediaHost` does not cover link-local or IPv6 — acceptable because HubChat does not fetch URL server-side
- 8MB cap validates declared metadata when supplied, not remote content length

---

## Remaining deferred work

| Phase | Scope |
| --- | --- |
| IG-AUTH-2E.3 | Queue binding + worker controlled OAuth routing |
| IG-AUTH-2E.4+ | Live provider smoke, staging, production canary |
| IG-AUTH-2E.7 | Production canary (explicit operator GO) |
| Later | Attachment upload / attachment_id, multi-image, caption policy |
| IG-AUTH-2F | Private reply |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |

---

## Verdict (final)

| Verdict | Result |
| --- | --- |
| **PASS WITH NOTES** | OAuth image client correct; IDs separated; direct URL path; URL validation boundary accurate; fail-closed; mocked tests; flags OFF; no worker/queue cutover — **confirmed at `16ca75b`** |

Documentation PR #251 ready for maintainer merge.

---

## Merge sequencing note

Queue binding (2E.3), worker route selection, and production canary (2E.7) require separate review after implementation.
