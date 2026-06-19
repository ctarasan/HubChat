# Agent B — IG-AUTH-2E.2B OAuth DM Image Delivery Security Review Preparation

## Status

**Awaiting Agent A implementation PR** — independent review prep only. Use this package when PR opens; do not merge by Agent B.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2E.2-B |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2e-2b-image-security-review-prep` |
| Base master SHA | `f51c1ee` (post PR #249 docs + PR #250 implementation) |
| Upstream foundation | IG-AUTH-2E.0 contract audit; IG-AUTH-2E.1 text adapter (PR #250); IG-AUTH-2A–2D credentials/resolver |
| Primary docs | [`ig-auth-2e-2-oauth-dm-image-review-checklist.md`](../../instagram/ig-auth-2e-2-oauth-dm-image-review-checklist.md), [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md), [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.2 adds an **OAuth Instagram DM image delivery foundation** parallel to the merged text foundation (PR #250). Agent A is expected to extend the OAuth messaging client and application service with image send behind a separate default-OFF flag (`HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED`), reusing `resolveForDelivery` with exact `channelConnectionId` and the same no-fallback policy.

**Image contract is not identical to text or legacy Page-token paths.** Official Instagram Login docs use the same host and send endpoint as text but a different `message` attachment shape than legacy `instagramAdapter.ts`. Agent B must verify the implementation against official Meta docs — not assume parity with text JSON or legacy `graph.facebook.com` payloads.

Worker, queue emission, production cutover, live Meta calls, attachment-upload cutover, and caption/private-reply behavior remain **deferred**.

## Master baseline (pre-2E.2)

| Merge | Content |
| --- | --- |
| #249 | IG-AUTH-2E.1-B security review prep docs |
| #250 | OAuth DM text provider client + application service |
| #248 | IG-AUTH-2E.0 outbound contract audit |
| #247 | Identity verification, OAuth Test Connection |
| #243 | Connection-bound resolver + safe queue binding types |

### Text foundation (merged — reference for 2E.2)

| Item | Merged behavior |
| --- | --- |
| Provider client | `instagramOAuthMessagingClient.ts` — `POST graph.instagram.com/{version}/{IG_ID}/messages` |
| Token transport | `Authorization: Bearer` header only |
| Endpoint choice | `/{professionalAccountId}/messages` from `provider_instagram_account_id` |
| Application service | `instagramOAuthTextDelivery.ts` — flags, resolver, validation, send |
| Resolver | `resolveForDelivery` with exact `tenantId` + `channelConnectionId`, `INSTAGRAM_BUSINESS_LOGIN`, `DATABASE_ONLY` |
| Recipient | Numeric IGSID (`InstagramMessagingScopedUserId`) |
| Outbound text flag | `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` — requires foundation + runtime + text |
| Worker isolation | `worker/main.ts` does not import OAuth text delivery |

### Legacy image path (production today — must not leak into OAuth)

| Item | Legacy behavior |
| --- | --- |
| Host | `graph.facebook.com` |
| Path | `POST /{version}/{PAGE_ID}/messages` |
| Token | Page Access Token (ENV/worker) |
| Payload | Singular `message.attachment` with `type: "image"`, `payload.url` |
| Extra fields | `messaging_type: "RESPONSE"` on image sends |
| Caption | Separate follow-up text message (not attachment caption) |
| Upload | Agent upload via `/api/messages/upload-image` → Supabase signed/public HTTPS URL |

### Current media architecture (HubChat)

- Outbound images uploaded via `POST /api/messages/upload-image` to Supabase Storage (`message-images` bucket).
- URL mode: signed (default 30-day TTL) or public per `MESSAGE_IMAGE_URL_MODE`.
- Pre-enqueue validation: `validateInstagramOutboundImageMedia` — HTTPS, JPEG/PNG/WEBP, 8MB Meta cap.
- `isUnsafeMediaHost` blocks obvious localhost/private hosts on upload route only.
- Meta fetches the URL server-side; HubChat legacy adapter does **not** server-fetch the image before send.

### Deferred gaps (unchanged by 2E.2 foundation)

- Worker/outbox OAuth route selection (2E.3)
- Queue binding emission with `channel_connection_id`
- Production flag enablement
- Live Meta delivery verification
- OAuth-native attachment upload API (if distinct from Page-token upload)
- Private reply, webhook migration, OAuth UI, refresh scheduler, legacy retirement, deployment

---

## Official provider contract matrix

Official source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19).

Cross-reference legacy (for contrast only): [Messenger Platform — Instagram Send Message](https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message/), [Attachment Upload](https://developers.facebook.com/docs/messenger-platform/instagram/features/attachment-upload/).

| Contract item | Instagram Login contract | Legacy / Page contract | Required for PR | Evidence | Risk |
| --- | --- | --- | --- | --- | --- |
| API family | Instagram API with Instagram Login | Messenger Platform + Facebook Login | Yes | Instagram Login messaging doc | **BLOCKED** if OAuth path uses Page API |
| Host | `https://graph.instagram.com` | `https://graph.facebook.com` | Yes | Both doc sets | Wrong host → cross-family leak |
| API version | Central config (`META_GRAPH_VERSION`) | Central config | Yes | 2E.1 text client | Hard-coded version drift |
| Send endpoint | `POST /{version}/{IG_ID}/messages` | `POST /{version}/{PAGE_ID}/messages` or `/me/messages` | Yes | Instagram Login doc | Page ID in OAuth path → **BLOCKED** |
| `/me/messages` vs `/{IG_ID}/messages` | Both documented; 2E.1 chose explicit `/{IG_ID}/messages` | Often `/me/messages` with Page token | Yes | PR #250 precedent | Ambiguous audit trail if `/me` used without justification |
| Sender / path ID | Instagram Professional Account ID (`<IG_ID>`) | Facebook Page ID | Yes | Instagram Login IDs section | Page ID → wrong tenant binding |
| Recipient | Instagram-scoped ID (IGSID) | IGSID (same semantic, different auth) | Yes | Both doc sets | PSID/username/conversation ID → misdelivery |
| Single-image payload | Doc sample: `message.attachments` object with `type: "image"`, `payload.url` | Singular `message.attachment` + `messaging_type` | Yes | Instagram Login "Send Images" | **Shape mismatch vs legacy** — do not copy legacy adapter |
| Multi-image payload | `message.attachments` array (up to 10) | `message.attachments` array on Page API | Out of 2E.2 scope unless PR claims it | Instagram Login doc | Scope creep |
| Audio/video/file payload | Singular `message.attachment` | Singular `message.attachment` | Out of 2E.2 scope | Instagram Login doc | Unsupported type must fail closed |
| `attachment.type` | `"image"` (lowercase in samples) | `"image"` / `"IMAGE"` in Page docs | Yes | Official samples | Wrong type → provider rejection |
| `payload.url` | HTTPS URL publicly fetchable by Meta | Same | Yes (URL path) | Instagram Login media table | SSRF if HubChat fetches; expiry if signed URL too short |
| `payload.attachment_id` | Supported in send samples | Supported via Page upload API | Only if PR implements upload | Instagram Login send + Postman collection | Upload API family unconfirmed for OAuth token |
| `is_reusable` | Not shown in Instagram Login send samples | Page upload API | Defer unless PR adds upload | Page attachment-upload doc | **NEEDS_PROVIDER_CONFIRMATION** for OAuth upload |
| Required permissions | `instagram_business_basic`, `instagram_business_manage_messages` | `instagram_manage_messages` + Page PAT | Yes | Instagram Login requirements | Permission mismatch |
| Image formats | png, jpeg (doc); GIF mentioned in send-images intro | Broader Messenger types | Yes | Instagram Login media table | WEBP acceptance without doc basis → review note |
| Size limit | 8MB images | 8MB (HubChat enforced) | Yes | Instagram Login media table | Over-size → terminal |
| Public URL requirement | Meta fetches URL; must be reachable | Same | Yes | Instagram Login doc | Signed URL TTL/expiry risk |
| Token transport | Bearer header | Query `access_token` or Bearer | Yes | Instagram Login curl samples | URL token → **BLOCKED** |
| Success response | `{ recipient_id, message_id }` | Same shape | Yes | Instagram Login doc | Malformed parse → contract error |
| Errors | Graph `error.code`, `error_subcode`, HTTP status | Same family | Yes | 2E.1 client mapping | Reuse taxonomy where applicable |
| Messaging window | 24-hour free-form window | Same policy | Yes | Instagram Login limitations | `MESSAGE_WINDOW_CLOSED` mapping |
| `messaging_type` | **Not shown** in Instagram Login image samples | `RESPONSE` on legacy HubChat | No unless doc requires | Contrast legacy adapter | Copying Page field → contract drift |
| Caption on attachment | **Not documented** | HubChat sends caption as separate text | Defer / explicit policy | Legacy caption follow-up | Unsupported field in payload → **CHANGES REQUESTED** |
| Private reply | Different flow (`comment_id`) | `graph.facebook.com` Page path | Forbidden in 2E.2 | Instagram Login doc defers | Scope violation |

---

## Endpoint ambiguity

| Topic | Status | Review action |
| --- | --- | --- |
| Single-image JSON key: `message.attachments` (object) vs `message.attachment` (legacy singular) | **NEEDS_PROVIDER_CONFIRMATION** — official Instagram Login single-image sample uses `attachments` as object; multi-image uses array; audio uses singular `attachment` | Agent A must cite official doc + mock provider test for chosen shape. Blind legacy port → **CHANGES REQUESTED** |
| Attachment Upload API under OAuth Bearer token | **NEEDS_PROVIDER_CONFIRMATION** — upload docs are Page-token / `graph.facebook.com/{PAGE_ID}/message_attachments` only | If PR uses `attachment_id` without OAuth upload contract → **BLOCKING_FOR_RUNTIME_CLIENT** unless Agent A documents separate official OAuth upload endpoint |
| WEBP MIME at OAuth boundary | **NEEDS_PROVIDER_CONFIRMATION** — Meta table lists png/jpeg; HubChat upload allows WEBP | Accept only if PR documents provider support or rejects WEBP at OAuth validation |
| GIF as image type | Mentioned in Instagram Login send-images intro | Out of 2E.2 unless explicitly scoped; do not assume |
| Caption handling | Not in OAuth image payload | Separate text send is legacy behavior — defer in 2E.2 foundation unless PR scope explicitly includes caption policy |

### Endpoint approval gate

| Verdict | Criteria |
| --- | --- |
| **PASS** | Exact endpoint and sender-ID semantics confirmed by official Instagram Login docs; payload shape matches cited doc sample; mocked provider tests assert exact JSON |
| **CHANGES REQUESTED** | Runtime-callable code uses endpoint or payload from another API family; ambiguous doc but code picks unstated shape; extra Page-only fields (`messaging_type`, Page ID path) |
| **BLOCKED** | `graph.facebook.com` or Page-token upload path introduced into OAuth image send; token in URL; legacy adapter fallback |

---

## Image payload contract

Agent A PR must expose an **explicit fixed payload builder** (same pattern as `buildInstagramOAuthTextMessagePayload`).

Review requirements:

- Recipient: IGSID only — validated branded type + runtime numeric check
- Attachment `type` exactly `"image"` per official sample (case-sensitive review)
- Payload contains **only** documented keys: `url` and/or `attachment_id` per chosen path
- No arbitrary object spread from caller input
- No unsupported `text` / caption field inside image payload (defer caption to 2E.2+ or separate text flag path)
- No private-reply fields (`comment_id`, etc.)
- No legacy `messaging_type` unless official Instagram Login doc requires it
- No `platform`, `tag`, or Messenger-only template fields
- Strict success parser: require `message_id`; optional `recipient_id`
- Single-image scope preferred for 2E.2 foundation

### Direct URL path (expected default)

- HTTPS only at validation boundary
- Public reachability: Meta server fetches URL — document signed-URL TTL vs delivery latency
- HubChat must **not** server-side fetch the image URL to "validate" or proxy unless strictly necessary; prefer static URL policy validation
- Reject profile URLs, internal storage paths, and non-media URLs at service boundary

### Attachment ID path (if implemented)

- Upload API host, credential type, and path must be documented with official citation
- Upload ownership bound to same `channel_connection_id` / professional account
- Attachment lifetime and reuse semantics documented
- Without OAuth upload docs: **BLOCKING_FOR_RUNTIME_CLIENT**

---

## URL / attachment-ID security

### SSRF and media URL risks

Provider model: **Meta fetches the URL**. HubChat sends URL string only.

If Agent A adds URL validation (recommended):

| Control | Required |
| --- | --- |
| HTTPS only | Yes |
| localhost / 127.0.0.0/8 rejected | Yes |
| Private RFC1918 rejected | Yes |
| Link-local (169.254.0.0/16) rejected | Yes |
| IPv6 local/private (`::1`, fc00::/7, fe80::/10) rejected | Yes |
| Embedded credentials (`https://user:pass@`) rejected | Yes |
| Malformed URL rejected | Yes |
| Bounded URL length | Yes |
| No server-side fetch of user-supplied URL | Yes — unless explicitly scoped with redirect disabled |
| No redirect-following fetch | Yes — if any fetch exists, `redirect: "manual"` |
| DNS rebinding | Document risk if fetch added; prefer no fetch |

Existing HubChat `isUnsafeMediaHost` (upload route) is **insufficient alone** for OAuth outbound URL validation — review for completeness at OAuth service boundary.

### Signed URL secrecy

- No full media URL in logs, errors, audit events, or test snapshots
- No query string (signed token) in operator-facing errors
- Redact path + host only in debug contexts
- No raw provider request/response body persistence

### Content restrictions

- No profile/avatar URL as send source
- No Source Post thumbnail reuse (`MEDIA_SHARE` deferred)
- No arbitrary internal storage path passed through without public HTTPS semantics
- MIME policy: align with official png/jpeg; document if WEBP rejected at OAuth layer
- Size policy: 8MB Meta cap enforced before provider call

---

## ID semantics

| Role | Required type | Source |
| --- | --- | --- |
| Sender / path ID | `InstagramProfessionalAccountId` | `provider_instagram_account_id` from resolver |
| Recipient | `InstagramMessagingScopedUserId` (IGSID) | Thread / queue input |

Must **not** use:

- OAuth exchange `provider_user_id` as recipient
- Facebook Page ID in path or body
- Facebook PSID
- Instagram username
- HubChat conversation ID

Review compile-time branded types and runtime boundary validation (mirror 2E.1 text validation).

---

## Feature flags

Expected image flag:

```text
HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED
```

Validation checklist:

| Case | Expected |
| --- | --- |
| Flag absent / blank / false / unsupported | OFF |
| Explicit true only | ON (with foundation + runtime) |
| Text flag ON, image flag OFF | Image send blocked |
| Image flag ON, text flag OFF | Text send blocked (regression) |
| Foundation or runtime OFF | Image blocked |
| Production env values in PR | **BLOCKED** |

Triple gate pattern mirrors `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED`.

---

## No-fallback expectations

For each precondition failure, provider must **not** be called:

| Precondition | Expected |
| --- | --- |
| Image flag OFF | Fail closed |
| Runtime/foundation OFF | Fail closed |
| Missing `channel_connection_id` | Fail closed |
| Invalid / non-HTTPS image URL | Fail closed |
| Unsupported MIME / oversize media | Fail closed |
| Missing recipient / invalid IGSID | Fail closed |
| Resolver disabled | Fail closed |
| Credential missing | Fail closed |
| REAUTH_REQUIRED / expired / revoked | Fail closed |
| Ambiguous config | Fail closed |
| Provider contract validation failure | Fail closed |

No fallback to:

- Legacy `InstagramAdapter`
- Facebook adapter
- ENV Page token
- Alternate connection heuristic
- Private-reply path
- Text adapter send
- Silent downgrade to legacy worker path

---

## Error / retry expectations

| Condition | Expected classification |
| --- | --- |
| Invalid URL | Terminal |
| Unsupported media / MIME | Terminal |
| Media too large | Terminal |
| Recipient unavailable | Terminal |
| Messaging window closed | Terminal (`MESSAGE_WINDOW_CLOSED`) |
| 401 / token revoked (190) | REAUTH_REQUIRED |
| Permission missing (10/200) | Configuration / terminal |
| Rate limit (429) | Retryable |
| Timeout / 5xx | Retryable |
| Malformed success body | PROVIDER_CONTRACT_ERROR |

Provider client must **not** internally retry image send (duplicate delivery risk). Queue/worker owns retries post-2E.3.

---

## Test matrix

### Contract / client

- Exact official host, path, version
- Exact JSON payload shape (not legacy)
- Bearer header; no token in URL
- Sender professional account ID in path
- Recipient IGSID in body
- Success `message_id` parse
- Malformed success rejected
- Common provider errors mapped
- No raw body leak in errors

### URL / security

- Valid HTTPS accepted
- HTTP rejected
- localhost / loopback / private / link-local rejected
- IPv6 local rejected
- Embedded credentials rejected
- Malformed / oversized URL rejected
- Signed-query not in error strings

### Service

- All flag OFF combinations fail closed
- Exact resolver inputs (`tenantId` + `channelConnectionId`)
- Lifecycle states (ACTIVE, TOKEN_EXPIRING, REAUTH_REQUIRED, etc.)
- No fallback on any failure path
- Provider mock not called when preconditions fail

### Regression

- OAuth text path unchanged
- Legacy Instagram adapter unchanged
- Facebook / LINE unchanged
- Private reply unchanged
- Webhook unchanged
- Worker / outbox unchanged

---

## Production boundary

Agent A PR must **not** include:

- Worker / outbox routing changes
- Queue / RPC emission changes
- Production flag enablement
- Live Meta HTTP in CI or runtime
- Schema / migration
- Deployment manifests
- Private reply
- OAuth UI
- Legacy retirement
- Attachment upload production cutover without review

Any production/live cutover claim → **BLOCKED**

Wording for Agent A report:

> OAuth DM image provider/application foundation merged. Production worker/outbox cutover and live verification remain deferred.

---

## Verdict rubric

| Verdict | When |
| --- | --- |
| **PASS** | Official Instagram Login endpoint; correct ID semantics; fixed payload builder matching cited doc; URL security controls; separate image flag default OFF; no fallback; mocked tests; no worker/queue/live scope |
| **PASS WITH NOTES** | Non-blocking gaps (e.g. WEBP policy note, attachment_id deferred, flag test coverage) |
| **CHANGES REQUESTED** | Wrong payload shape; Page API leakage; missing URL validation; caption/legacy fields; text/image flag coupling |
| **BLOCKED** | graph.facebook.com OAuth path; production cutover; live Meta; secrets; fallback to legacy; server-side unbounded URL fetch |

---

## Potential conflicts with Agent A

| Area | Conflict risk | Mitigation |
| --- | --- | --- |
| `instagramOAuthMessagingClient.ts` | Agent A extends same file Agent B reviewed for text | Review delta only; text tests must still pass |
| Shared error taxonomy | New image-specific codes | Accept if consistent with 2E.1 patterns |
| Flag module naming | New `instagramOAuthOutboundImageFlags.ts` vs extending text flags file | Either OK if triple-gate preserved |
| Payload builder location | Same client module | Ensure text builder untouched |
| Docs under `docs/instagram/` | Agent A may add implementation report | B checklist remains independent |
| LATEST pointer files | Both agents may touch | B intentionally skips LATEST updates |

---

## Scope confirmation

IG-AUTH-2E.2B docs/review-prep only. No implementation/source/runtime/test/schema/migration changes. No production flag or environment changes. No queue/worker/outbox cutover. No live provider calls or image sends. No private reply, webhook, profile enrichment, OAuth UI, refresh, legacy retirement, or deployment. No merge performed by Agent B.

## Verification

At commit: `git diff --check`, docs-only diff, hidden/bidi scan, secret scan (placeholders only in examples).
