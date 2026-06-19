# Agent B — IG-AUTH-2E.1B OAuth DM Text Delivery Security Review Preparation

## Status

Complete — docs/review-prep only (no product runtime changes). Awaiting Agent A IG-AUTH-2E.1 implementation PR.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2E.1-B |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2e-1b-security-review-prep` |
| Base master SHA | `d4865e4` (post PR #248 IG-AUTH-2E.0 merge) |
| Parallel owner | Agent A — IG-AUTH-2E.1 OAuth DM text adapter foundation |
| Upstream foundation | IG-AUTH-2A–2D credentials/resolver/identity; IG-AUTH-2E.0 outbound audit |
| Primary docs | [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md), [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.1 is the first **implementation** slice for OAuth Instagram DM text delivery. Agent A scope is adapter/provider-client foundation with **mocked provider tests only** — no worker wire, no queue binding emission, no production cutover.

This prep package gives Agent B a fast independent-review path: official provider-contract validation matrix, ID semantics rules, no-fallback criteria, secret/logging gates, expected test matrix, and verdict rubric.

**Current master baseline:** Instagram outbound is 100% legacy Page-token + `graph.facebook.com/{pageId}/messages`. OAuth `resolveForDelivery` exists but is not used on the delivery path. Queue jobs do not carry `instagramCredentialBinding`.

## Master baseline (post 2E.0)

| Merge | Content |
| --- | --- |
| #248 | IG-AUTH-2E.0 outbound contract audit — legacy flow mapped, OAuth gaps documented |
| #246 | IG-AUTH-2D security review prep |
| #247 | Identity verification, OAuth Test Connection, discriminated routing |
| #243 | Connection-bound resolver + safe queue binding types |
| #242 | OAuth credential schema/repository |

Master HEAD: `d4865e4`. All OAuth flags default OFF.

## IG-AUTH-2E.0 findings reused for 2E.1 review

| Finding | 2E.1 review implication |
| --- | --- |
| Legacy send uses Page token in URL on `graph.facebook.com` | OAuth text client **must not** reuse legacy adapter or Page token validator |
| `instagramCredentialBinding` not emitted at outbox | 2E.1 may accept in-memory/resolver inputs; **must not** claim queue/worker cutover |
| Worker resolves Instagram by `tenantId` only | 2E.1 adapter must require explicit `channelConnectionId` at API boundary |
| Recipient IGSID from `ig:user:{id}` thread | OAuth text send recipient must be IGSID, never professional account ID |
| `/me/messages` vs `/{IG_ID}/messages` ambiguous in audit | Prefer `/{professionalAccountId}/messages` from credential binding; mark if PR chooses `/me` |
| Image/private reply separate | **Out of 2E.1 scope** — BLOCK if PR adds image send or private reply |

## Official provider contract validation matrix

Source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19). Cross-ref: [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md).

| Provider contract item | Expected | Evidence source | PR review check | Risk if wrong |
| --- | --- | --- | --- | --- |
| Host | `https://graph.instagram.com` only | Official messaging doc — Base URL | Fixed constant; no `graph.facebook.com` | Wrong identity plane; token misuse |
| API version | Central config (`readInstagramOAuthServerConfig().graphVersion` / `META_GRAPH_VERSION`) | Project policy + official `{version}` in path | No hard-coded version in adapter; no user input in version | Version drift; injection |
| Text endpoint | `POST /{version}/{IG_ID}/messages` **or** `POST /{version}/me/messages` | Official doc — Endpoints | Fixed path template; sender ID from credential not client input | Wrong account send; audit failure |
| Endpoint choice | Prefer `/{professionalAccountId}/messages` from `provider_instagram_account_id` | 2E.0 recommendation; both endpoints documented | PR documents choice; `/me` acceptable if Bearer token scoped correctly | Ambiguous sender binding |
| Sender / account ID | Instagram professional account ID (`<IG_ID>`) of connected account | Official doc — IDs | From resolver `providerInstagramAccountId`; not Page ID | Message sent from wrong account |
| Recipient ID | Instagram-scoped user ID (IGSID) | Official doc — IDs; webhook | From thread parse / explicit input; not professional account ID | DM to wrong party |
| Text payload shape | `{ "recipient": { "id": "<IGSID>" }, "message": { "text": "<TEXT_OR_LINK>" } }` | Official doc — Send a text message | Strict builder; no arbitrary keys | Provider rejection / injection |
| Text limit | UTF-8, ≤ 1000 bytes | Official doc | Validate before HTTP; reject blank/over-limit | Provider 400; log leak of long text |
| Token transport | `Authorization: Bearer <token>` header | Official sample curl | Bearer only; **no** `access_token` query param | Token leak in URL/logs |
| Required permissions | `instagram_business_basic`, `instagram_business_manage_messages` | Official doc — Permissions | Document assumption; map permission errors | Silent send failure |
| Success response | `{ "recipient_id", "message_id" }` | Official doc — Sample API Response | Strict parse; map `message_id` → `external_message_id` contract | Idempotency / delivery tracking break |
| Provider error shape | Graph `{ error: { message, code, error_subcode? } }` | Meta Graph pattern | Sanitize; map to internal taxonomy | Raw Meta body leak |
| Messaging window | 24-hour reply window after user message | Official doc — Send a message | Map to `MESSAGE_WINDOW_CLOSED` terminal (reuse legacy classifier where applicable) | Retry storm on terminal case |
| Recipient eligibility | User must have messaged professional account first | Official doc — How It Works | Document; do not claim cold outbound | Policy violation |

## Endpoint ambiguity / provider confirmation items

| Topic | Status | 2E.1 review action |
| --- | --- | --- |
| `/me/messages` vs `/{IG_ID}/messages` | Both documented by Meta | PASS if PR picks one explicitly and tests path construction |
| Image `attachments` vs singular `attachment` | Documented for images | **Defer to 2E.2** — CHANGES REQUESTED if 2E.1 implements image |
| Exact rate-limit QPS | Not fully specified | Treat HTTP 429 as retryable; do not invent limits |
| OAuth token prefix validation | IGA vs EA semantics differ from legacy | OAuth client must **not** use legacy `assertLikelyGraphPageAccessToken` |
| Human-agent tag / window extension | Documented separately | **Defer** — not 2E.1 scope |

## ID semantics checklist

| Type | Outbound role | Must not be used as |
| --- | --- | --- |
| `InstagramProfessionalAccountId` | Sender `<IG_ID>` in path | Recipient |
| `InstagramMessagingScopedUserId` | Recipient IGSID | Sender; credential key |
| `InstagramOAuthProviderUserId` | Token exchange metadata only | Recipient or path segment |
| `InstagramUsername` | Display only | Routing key |
| Facebook Page ID | Legacy sender only | OAuth path |
| Facebook PSID | Facebook Messenger only | Instagram OAuth path |

**PASS:** Branded types or equivalent validation; recipient parse from `ig:user:{IGSID}`; professional ID from resolver only.

**CHANGES REQUESTED:** Username or professional account ID accepted as recipient; Page ID in OAuth URL path.

## No-fallback checklist

| Scenario | Expected behavior | Legacy/ENV/provider call? |
| --- | --- | --- |
| Runtime flag OFF | Fail closed `OAUTH_RUNTIME_DISABLED` | No |
| Outbound text subflag OFF (if present) | Fail closed | No |
| Missing `channelConnectionId` | Fail closed before resolver | No |
| Resolver/foundation disabled | Fail closed | No |
| Credential not found | Terminal configuration error | No |
| `REAUTH_REQUIRED` | Terminal; no token use | No |
| Token expired/revoked | Terminal reauth path | No |
| Permission missing | Terminal configuration error | No |
| Ambiguous legacy+OAuth config | Fail closed (mirror 2D Test Connection) | No |
| Recipient IGSID missing/invalid | Fail closed before provider | No |
| Provider contract mismatch | Terminal; no legacy retry | No |
| OAuth provider HTTP error | No fallback to Page adapter | No |

**Invariant (from 2E.0):** OAuth text path must never silently use Facebook Page token, ENV credential, another connection, or legacy Instagram adapter.

## Secret/logging checklist

Review-time search patterns:

```text
Authorization|Bearer|accessToken|access_token|ciphertext|providerResponse|raw|console\.|logger
```

| Allowed | Forbidden |
| --- | --- |
| Fake test fixtures (`Bearer test-token`) | Real access tokens |
| Type names / parameter names | Authorization header in logs |
| Sanitized error codes | Ciphertext in logs/errors |
| Masked IDs per existing policy | Raw provider request/response bodies |
| Host + path in debug (no token) | Full message text in public error preview |
| | Full IGSID in public API unless policy allows |

## Expected test matrix (Agent A PR)

See [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md) §12 for full matrix.

Minimum bar:

- Provider client: fixed host/path, Bearer header, no URL token, payload shape, error mapping, no secret logging
- Adapter/service: flag OFF fail closed, exact tenant+connection resolver input, REAUTH/expired fail closed, no legacy/ENV fallback
- Regression: legacy Instagram/Facebook/LINE unchanged; worker path unchanged unless explicitly scoped (expected **unchanged** for 2E.1)

## Production boundary checklist

Agent A PR must **not** include:

- Production flag enablement or env value changes
- Migration execution or schema changes (queue binding deferred to 2E.3)
- Worker/outbox wiring (deferred to 2E.3)
- Live provider calls or real customer messages
- Deployment, canary, legacy retirement
- OAuth UI, webhook, private reply, image send

Any of the above → **BLOCKED**.

## Review verdict rubric (Agent A PR)

| Verdict | When |
| --- | --- |
| **PASS** | Docs-only scope gate OK; OAuth text client uses official contract; ID semantics correct; fail-closed without legacy/ENV fallback; mocked tests prove behavior; flags default OFF; no worker/queue cutover |
| **PASS WITH NOTES** | Minor doc/test gaps only; endpoint choice `/me` vs `/{IG_ID}` documented |
| **CHANGES REQUESTED** | Page token path; token in URL; heuristic connection pick; missing fail-closed; image/private reply in scope; weak tests |
| **BLOCKED** | Worker wire; queue emission; production flags; live send; schema migration; secrets in diff |

## Phase 15 — When Agent A PR opens

1. Separate worktree on Agent A branch
2. Walk [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md)
3. Run secret/bidi scan, typecheck, lint, tests, build
4. Post GitHub comment with verdict
5. **Do not merge**

## Scope confirmation

IG-AUTH-2E.1B docs/review-prep only. No implementation. No env/deploy/merge. Shared LATEST pointers not updated to avoid parallel conflict with Agent A.

## Verification

`git diff --check`, docs only, hidden/bidi + secret scan at commit.
