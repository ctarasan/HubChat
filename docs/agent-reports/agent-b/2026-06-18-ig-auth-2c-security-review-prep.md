# Agent B — IG-AUTH-2C OAuth Threat Model and Review Preparation

## Status

Complete — docs/audit only (no product runtime changes). Awaiting Agent A IG-AUTH-2C implementation PR.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2C-B |
| Date | 2026-06-18 |
| Branch | `docs/ig-auth-2c-security-review-prep` |
| Base master SHA | `ea94515` (post IG-AUTH-2B merge, PR #243) |
| Parallel owner | Agent A — Instagram OAuth start/callback, state, token exchange |
| Architecture source | [`ig-oauth-architecture-adr.md`](../../instagram/ig-oauth-architecture-adr.md) ADR-4/5 |
| Upstream foundation | IG-AUTH-2A credentials, IG-AUTH-2B queue/resolver contract |
| Primary docs | [`ig-auth-2c-threat-model.md`](../../instagram/ig-auth-2c-threat-model.md), [`ig-auth-2c-review-checklist.md`](../../instagram/ig-auth-2c-review-checklist.md) |

## Executive summary

IG-AUTH-2C adds Instagram Business Login **start** and **callback** with server-side code exchange and credential activation. Agent B audited master Facebook OAuth patterns and Instagram architecture docs before implementation.

**Reference implementation:** Facebook channel-connect OAuth (`facebookOAuthService.ts`, `facebookGraphOAuth.ts`, `oauth_transactions`). Instagram must mirror state security and redirect policy while using Business Login endpoints (`api.instagram.com`, `graph.instagram.com`) and connection-bound credential activation (no page picker).

**Critical 2C review gates:** state hash + atomic claim, ADMIN-only start, callback binding from state only, connect flag on start+callback, no code/token in redirects/logs, official Meta provider evidence, PKCE absence documented, runtime/worker/UI unchanged.

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2c-threat-model.md`](../../instagram/ig-auth-2c-threat-model.md) | Reuse-risk table, 20-threat matrix, state/PKCE/provider surfaces |
| [`ig-auth-2c-review-checklist.md`](../../instagram/ig-auth-2c-review-checklist.md) | PR review — scope, state, role, redirect, provider, flags, runtime no-change |

## Existing OAuth patterns audited

Facebook start/callback routes, `facebookOAuthService`, `facebookOAuthSecurity`, `supabaseOAuthTransactionRepository`, `facebookGraphOAuth`, `auth.ts` role enforcement, `oauth_transactions` schema, `assertFacebookOAuthPublicDtoSafe`, `instagramOAuthFoundationFlags`, architecture ADR-4/5.

## Threat model

20 threats — see threat model doc. Top: login CSRF, state replay/theft, code/token leak, open redirect, privilege escalation, flag bypass, credential overwrite, wrong OAuth product (Basic Display).

## State controls

CSPRNG state, SHA-256 at rest, 15m TTL, tenant+connection+provider+actor binding, atomic `consumeStateAtCallback`, no plaintext state in logs/redirect.

## Atomic-consume requirements

Conditional update `status = PENDING AND consumed_at IS NULL`; parallel callback race → one winner; see threat model § State atomic-consume.

## Role/tenant controls

ADMIN-only start; tenant from auth context; connection ownership validation; callback uses state record only.

## Redirect controls

Fixed Channel Settings destination; enum errorCategory; no secrets in Location; unsafe redirect regex guard.

## Provider-contract checklist

Official Meta Business Login docs for authorize, exchange, long-lived `ig_exchange_token`; fixed hosts; minimum scopes; no raw response persist.

## PKCE decision checklist

Not documented by Meta for Business Login (ADR-4) — if absent, document explicitly; if present, require official evidence.

## Token/code exposure surfaces

16 surfaces audited — logs, redirect, state rows, credential rows, DTOs, snapshots, browser history, ops.

## Credential activation checklist

Exchange before activate; encrypt via canonical utility; tenant+connection binding; no silent ACTIVE overwrite; no runtime cutover on success.

## Feature-flag checklist

`HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` (or equivalent): absent/blank/false=OFF; gates start+callback; runtime flag stays OFF.

## Error-handling checklist

Sanitized categories only; no provider text/code/state in public responses.

## Runtime no-change checklist

Legacy outbound, worker, adapter, queue, UI, Test Connection, webhooks unchanged post-merge.

## Unknowns

Exact routes, connect flag name, `oauth_transactions` INSTAGRAM migration, multi-account picker, Cache-Control on callback.

## Phase 15

Separate worktree PR review; verdict PASS / PASS WITH NOTES / CHANGES REQUESTED / BLOCKED; do not merge.

## Scope confirmation

Docs/security review preparation only. No OAuth implementation. No runtime/UI/env/deploy/merge.

## Verification

`git diff --check`, 3 docs only, hidden/bidi + secret scan at commit.
