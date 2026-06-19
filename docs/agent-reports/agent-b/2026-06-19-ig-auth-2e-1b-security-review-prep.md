# Agent B — IG-AUTH-2E.1B OAuth DM Text Delivery Security Review Preparation

## Status

**Finalized** — docs aligned with merged implementation (PR #250 on master `f355025`). Ready for maintainer merge of PR #249.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2E.1-B |
| Date | 2026-06-19 (finalized 2026-06-19 post-merge) |
| Branch | `docs/ig-auth-2e-1b-security-review-prep` |
| Base master SHA | `f355025` (post PR #250 merge) |
| Implementation PR | [#250](https://github.com/ctarasan/HubChat/pull/250) — merged |
| Documentation PR | [#249](https://github.com/ctarasan/HubChat/pull/249) — open |
| Upstream foundation | IG-AUTH-2A–2D credentials/resolver/identity; IG-AUTH-2E.0 outbound audit |
| Primary docs | [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md), [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.1 merged on master adds an **OAuth Instagram DM text delivery foundation** behind default-OFF flags: provider client on `graph.instagram.com/{IG_ID}/messages` with Bearer auth, application service using `resolveForDelivery` with exact `channelConnectionId`, and strict IGSID recipient validation — with no legacy/ENV/Page-token fallback.

**Worker, queue emission, and production cutover remain deferred** (IG-AUTH-2E.3+).

This prep package documents the independent-review criteria used for PR #250 and preserves the checklist for future 2E.2+ slices.

## Master baseline (post 2E.1)

| Merge | Content |
| --- | --- |
| #250 | OAuth DM text provider client + application service; outbound text flag |
| #248 | IG-AUTH-2E.0 outbound contract audit |
| #247 | Identity verification, OAuth Test Connection |
| #243 | Connection-bound resolver + safe queue binding types |

Master HEAD: `f355025`. Production Instagram outbound path remains legacy until 2E.3 worker/queue wiring. All OAuth flags default OFF.

## Final implementation summary (merged PR #250)

| Item | Value |
| --- | --- |
| Provider client | `instagramOAuthMessagingClient.ts` — `POST graph.instagram.com/{version}/{IG_ID}/messages` |
| Token transport | `Authorization: Bearer` header only |
| Endpoint choice | `/{professionalAccountId}/messages` from `provider_instagram_account_id` (not `/me/messages`) |
| Application service | `instagramOAuthTextDelivery.ts` — flags, resolver, validation, send |
| Resolver | `resolveForDelivery` with exact `tenantId` + `channelConnectionId`, `INSTAGRAM_BUSINESS_LOGIN`, `DATABASE_ONLY` |
| Recipient | Numeric IGSID (`InstagramMessagingScopedUserId`); username and sender professional ID rejected |
| Outbound text flag | `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` — requires foundation + runtime + text flags |
| No-fallback | No legacy adapter, ENV Page token, Facebook adapter, or alternate connection |
| Worker isolation | `worker/main.ts` does not import text delivery service |

## Final implementation review evidence

| Field | Value |
|-------|-------|
| Implementation PR | #250 |
| Merged master SHA | `f3550251de337448b37420ad5b6574f705328403` |
| Pre-merge reviewed SHA | `03604241b05168f59c9bf0a35948eaf70a26dc8c` |
| Review result | **PASS** (independent implementation review) |
| Review comment | https://github.com/ctarasan/HubChat/pull/250#issuecomment-4748294516 |
| Test evidence | 2,201 tests pass; targeted provider + service tests |
| Security controls verified | Official endpoint, Bearer-only token, exact connection binding, ID semantics, fail-closed flags, no fallback, worker isolation |
| Post-merge doc alignment | **PASS** — this commit |

## Verified controls (PR #250)

- Fixed Instagram Login messaging endpoint on `graph.instagram.com`
- Bearer token transport; no query-string token
- Sender = connection-bound Instagram Professional Account ID
- Recipient = Instagram Messaging Scoped User ID (IGSID)
- Exact `channel_connection_id` required for `resolveForDelivery`
- `INSTAGRAM_BUSINESS_LOGIN` and `DATABASE_ONLY` enforced
- Runtime + outbound text flags default OFF (triple gate)
- No legacy Instagram, Facebook, ENV, or alternate-connection fallback
- Strict text payload and success response parsing
- Sanitized error taxonomy; no token/raw body exposure
- Worker/outbox production path unchanged

## Official provider contract validation matrix

Source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) (checked 2026-06-19). Cross-ref: [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md).

| Provider contract item | Expected | Merged implementation |
| --- | --- | --- |
| Host | `https://graph.instagram.com` only | **Verified** — `INSTAGRAM_GRAPH_HOST` |
| API version | Central config | **Verified** — `readInstagramOAuthServerConfig().graphVersion` |
| Text endpoint | `POST /{version}/{IG_ID}/messages` | **Verified** — explicit professional account ID path |
| Sender ID | Professional account ID from credential | **Verified** — `providerInstagramAccountId` |
| Recipient ID | IGSID | **Verified** — numeric validation; sender ID rejected as recipient |
| Text payload | `{ recipient: { id }, message: { text } }` | **Verified** — fixed builder |
| Token transport | Bearer header only | **Verified** — URL token guard |
| Success response | `message_id`, optional `recipient_id` | **Verified** — strict parse |
| Messaging window | 24-hour window | **Verified** — `MESSAGE_WINDOW_CLOSED` mapping |

## Endpoint decisions (resolved)

| Topic | Merged choice |
| --- | --- |
| `/me/messages` vs `/{IG_ID}/messages` | **`/{professionalAccountId}/messages`** for explicit audit trail |
| Image payload shape | **Deferred to 2E.2** |
| Human-agent tag / window extension | **Deferred** |

## Production enablement boundary

PR #250 merge does **not** enable production OAuth DM delivery.

| Item | Status on master |
|------|------------------|
| OAuth text provider/service code | Present |
| Outbound text feature flag | Default **OFF** |
| Worker/outbox routing | **Not wired** |
| Queue binding emission | **Not implemented** |
| Production env values | Not changed |
| Live Meta delivery test | Not performed |
| Image/private reply | Not implemented |
| Deployment/canary | Not performed |

OAuth DM text provider/application foundation merged. Production worker/outbox cutover and live verification remain deferred.

## Remaining deferred work

| Phase | Scope |
|-------|-------|
| IG-AUTH-2E.2 | OAuth image delivery adapter |
| IG-AUTH-2E.3 | Queue binding emission + worker route selection |
| IG-AUTH-2E.4+ | Security review, mocked smoke, staging, production canary |
| IG-AUTH-2F | Private reply OAuth path |
| IG-AUTH-2H | Refresh scheduler |
| IG-AUTH-2I | Legacy retirement |
| Channel Settings OAuth UI | Operator connect UX |

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2e-1-oauth-dm-text-review-checklist.md`](../../instagram/ig-auth-2e-1-oauth-dm-text-review-checklist.md) | Verified checklist + production boundary |
| [`ig-auth-2e-0-outbound-provider-contract.md`](../../instagram/ig-auth-2e-0-outbound-provider-contract.md) | Provider contract reference |

## Scope confirmation

Documentation alignment and final security evidence only. No source/runtime/test/schema/migration changes. No merge performed by Agent B.

## Verification

`git diff --check`, docs only, hidden/bidi + secret scan at commit.
