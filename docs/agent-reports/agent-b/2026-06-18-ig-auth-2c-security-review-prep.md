# Agent B — IG-AUTH-2C OAuth Threat Model and Review Preparation

## Status

**Finalized** — docs aligned with merged implementation (PR #245 on master `e480f07`). Ready for maintainer merge of PR #244.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2C-B |
| Date | 2026-06-18 (finalized 2026-06-18 post-merge) |
| Branch | `docs/ig-auth-2c-security-review-prep` |
| Base master SHA | `e480f07` (post PR #245 merge) |
| Implementation PR | [#245](https://github.com/ctarasan/HubChat/pull/245) — merged |
| Documentation PR | [#244](https://github.com/ctarasan/HubChat/pull/244) — open |
| Primary docs | [`ig-auth-2c-threat-model.md`](../../instagram/ig-auth-2c-threat-model.md), [`ig-auth-2c-review-checklist.md`](../../instagram/ig-auth-2c-review-checklist.md) |

## Executive summary

IG-AUTH-2C merged on master adds Instagram Business Login **start** and **callback** with dedicated `instagram_oauth_states` storage, atomic state claim **before** token exchange, encrypted credential activation via IG-AUTH-2A repository, and default-OFF connect flag gating.

**Implementation reference (merged):** `instagramOAuthConnectService.ts`, `instagramBusinessLoginOAuth.ts`, `supabaseInstagramOAuthStateRepository.ts`, routes under `/api/channel-connect/instagram/oauth/*`.

**Pre-merge review:** Agent B independent review PASS at `0cf6c69` — [GitHub comment](https://github.com/ctarasan/HubChat/pull/245#issuecomment-4739840647).

**Post-merge alignment:** This documentation set updated to reflect merged code. Connect success on master does **not** imply production enablement.

## Final implementation summary (merged code)

| Item | Value |
|------|-------|
| Route prefix | `channel-connect` |
| Start | `POST /api/channel-connect/instagram/oauth/start` |
| Callback | `GET /api/channel-connect/instagram/oauth/callback` |
| Connect flag | `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` — absent/blank/false = OFF |
| State storage | `instagram_oauth_states` table (not `oauth_transactions`) |
| State entropy | 32-byte CSPRNG base64url (`instagramOAuthSecurity.ts`) |
| Hash at rest | SHA-256 `state_hash` only |
| State TTL | 10 minutes |
| Binding | tenant + `channel_connection_id` + provider + actor + `return_destination` enum |
| Atomic claim | `claimStateAtCallback` UPDATE … `status=PENDING` → `CLAIMED` before exchange |
| Finalize | `CONSUMED` or `FAILED` with `consumed_at` — no return to PENDING |
| Provider authorize | `https://www.instagram.com/oauth/authorize` |
| Code exchange | `POST https://api.instagram.com/oauth/access_token` |
| Long-lived | `GET graph.instagram.com/.../access_token?grant_type=ig_exchange_token` |
| Scopes | `instagram_business_basic`, `instagram_business_manage_messages` |
| PKCE | Not implemented — documented absence per Meta Business Login docs |
| Credential flow | `createPending` → exchange → `activate` (or `activate` in place for REAUTH_REQUIRED/PENDING) |
| ACTIVE guard | Rejects `INSTAGRAM_OAUTH_ALREADY_CONNECTED` |
| Redirect | `/dashboard/channel-settings?channel=instagram&instagramOAuth=connected\|error&errorCode=…` |
| Runtime cutover | None — worker/adapter/queue/UI unchanged |

## Final implementation review evidence

| Field | Value |
|-------|-------|
| Implementation PR | #245 |
| Merged master SHA | `e480f074bf81ad810ed4bd53b71033871334ec94` |
| Pre-merge reviewed SHA | `0cf6c69b019298fc1c0e98c35a8bc1b3ce4cf036` |
| Review result | **PASS** (independent implementation review) |
| Review comment | https://github.com/ctarasan/HubChat/pull/245#issuecomment-4739840647 |
| Files/surfaces reviewed | 25 implementation files — routes, service, state repo, provider client, migration, tests |
| Test evidence | 2,145 tests pass; targeted state, route, service, provider tests |
| Security controls verified | State hash, atomic claim, ADMIN start, fixed endpoints/scopes, redirect safety, flag gating, audit secrecy |
| Runtime no-change evidence | `instagramOAuthRoutes.test.ts` worker regression guard on `src/worker/main.ts` |
| Post-merge doc alignment | **PASS** — this commit |

## Production enablement boundary

PR #245 merge does **not** enable production Instagram OAuth.

| Item | Status on master |
|------|------------------|
| OAuth start/callback code | Present |
| Connect feature flag | Default **OFF** |
| Production env value | Not changed |
| Production migration execution | Not performed |
| Channel Settings OAuth UI | Not implemented |
| Test Connection parity | Not implemented |
| OAuth delivery/runtime cutover | Not performed |
| Legacy credential retirement | Not performed |
| Deployment/live OAuth smoke | Not performed |

## Remaining deferred work

| Phase | Scope |
|-------|-------|
| IG-AUTH-2D | Identity verification, Test Connection parity |
| IG-AUTH-2E | DM adapter cutover |
| IG-AUTH-2F | Private reply |
| IG-AUTH-2G | Source Post/profile parity |
| IG-AUTH-2H | Refresh/reauth scheduler |
| IG-AUTH-2I | Rollout and legacy retirement |

## Operational evidence not yet available

- Production Meta App Review approval
- Production redirect URI registration
- Production connect flag enablement
- Live provider token response validation in production
- Controlled flag-on smoke in staging/production
- Connect/reconnect/disconnect operator runbook execution

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2c-threat-model.md`](../../instagram/ig-auth-2c-threat-model.md) | Final threat matrix with implementation evidence |
| [`ig-auth-2c-review-checklist.md`](../../instagram/ig-auth-2c-review-checklist.md) | Verified vs production-enablement vs deferred |

## Scope confirmation

Documentation alignment and final security evidence only. No source/runtime/test/schema/migration changes. No merge performed by Agent B.
