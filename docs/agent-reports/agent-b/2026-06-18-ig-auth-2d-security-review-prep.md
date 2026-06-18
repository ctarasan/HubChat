# Agent B — IG-AUTH-2D Identity and Test Connection Security Review Preparation

## Status

Complete — docs/audit only (no product runtime changes). Awaiting Agent A IG-AUTH-2D implementation PR.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2D-B |
| Date | 2026-06-18 |
| Branch | `docs/ig-auth-2d-security-review-prep` |
| Base master SHA | `796affe` (post PR #244/#245 merge) |
| Parallel owner | Agent A — IG-AUTH-2D identity verification + Test Connection parity |
| Upstream foundation | IG-AUTH-2A credentials, IG-AUTH-2B resolver, IG-AUTH-2C connect/callback |
| Primary docs | [`ig-auth-2d-identity-threat-model.md`](../../instagram/ig-auth-2d-identity-threat-model.md), [`ig-auth-2d-review-checklist.md`](../../instagram/ig-auth-2d-review-checklist.md) |

## Executive summary

IG-AUTH-2D adds **own-account identity verification** (`/me`) before OAuth credential activation and **connection-bound Test Connection** using the same credential resolver policy as runtime — without enabling delivery cutover.

**Current baseline (pre-2D on master):**

- IG-AUTH-2C callback activates credential using `user_id` from token exchange response only — **no `/me` verification yet** (`instagramOAuthConnectService.persistCredential`).
- Legacy Instagram Test Connection uses Facebook Page probe on `graph.facebook.com` (`verifyInstagramChannelHealth`) — tenant-global, not `channelConnectionId`-bound.
- `providerInstagramAccountId` and `providerUserId` both exist on credential row; semantic distinction must be enforced in 2D.
- IGSID lives in conversation thread keys (`ig:user:<id>`) — must never be confused with professional account ID.

**Critical 2D review gates:** identity before activation, account-switch rejection on reauth, exact tenant+connection binding in Test Connection, no ENV/legacy fallback, identity-only probe (no DM), sanitized public DTO, test flag separate from delivery flag.

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2d-identity-threat-model.md`](../../instagram/ig-auth-2d-identity-threat-model.md) | Identity matrix, 16-threat model, provider contract, side-effect audit |
| [`ig-auth-2d-review-checklist.md`](../../instagram/ig-auth-2d-review-checklist.md) | Callback verification, Test Connection trust boundary, test matrix, PR review workflow |

## Identity model audited

See identity matrix in threat model doc. Key gaps on master: callback trusts exchange `user_id` without `/me`; legacy test uses Page ID not IG professional account ID.

## Threat model summary

16 threats — identity confusion, token substitution, account switch, fallback, side effects, permission overclaim. Full matrix in threat model doc.

## Test Connection trust boundary (target)

Authenticated ADMIN; tenant from auth; exact `channelConnectionId`; OAuth resolver with `DATABASE_ONLY`; no tenant-global lookup; no ENV fallback; no message send.

## Feature flags (expected)

| Flag | Purpose |
|------|---------|
| `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` | Test Connection OAuth path (expected) |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | Unchanged — connect only |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | Unchanged OFF — no delivery |

## Runtime no-change (post-2D merge requirement)

Legacy test path unchanged when flags OFF; no worker/adapter/queue cutover; no OAuth UI; no production env values.

## Phase 14 — After Agent A PR

Separate worktree; walk review checklist; verdict PASS / PASS WITH NOTES / CHANGES REQUESTED / BLOCKED; do not merge.

## Unknowns (await Agent A PR)

Exact `/me` fields, account_type eligibility values, masked ID format in public DTO, test route body shape (`channelConnectionId` required?), flag names, REAUTH username-only drift policy tests.

## Scope confirmation

Docs/security review preparation only. No implementation. No env/deploy/merge.

## Verification

`git diff --check`, 3 docs only, hidden/bidi + secret scan at commit.
