# Agent B — IG-AUTH-2B Queue Secrecy and Resolver Review Preparation

## Status

Complete — docs/audit only (no product runtime changes). Awaiting Agent A IG-AUTH-2B implementation PR.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2B-B |
| Date | 2026-06-18 |
| Branch | `docs/ig-auth-2b-security-review-prep` |
| Base master SHA | `6a709fb` (IG-AUTH-2A merged, PR #242) |
| Parallel owner | Agent A — IG-AUTH-2B queue contract + Instagram OAuth resolver |
| Architecture source | [`ig-oauth-architecture-adr.md`](../../instagram/ig-oauth-architecture-adr.md) ADR-2, ADR-6, ADR-7 |
| Upstream foundation | IG-AUTH-2A `instagram_oauth_credentials` repository |
| Primary docs | [`ig-auth-2b-queue-exposure-matrix.md`](../../instagram/ig-auth-2b-queue-exposure-matrix.md), [`ig-auth-2b-review-checklist.md`](../../instagram/ig-auth-2b-review-checklist.md) |

## Executive summary

IG-AUTH-2B binds Instagram outbound queue jobs to `channel_connection_id` and adds an OAuth-aware resolver. Agent B audited master queue, worker, resolver, ops, and logging surfaces **before** implementation lands.

**Current baseline:** `OutboundMessageRequestedPayload` has no tokens; `channelConnectionId` comes from conversation at worker time; Instagram uses `DB_WITH_ENV_FALLBACK` + env tokens. Facebook OAuth already has `blockLegacyFallback` — Instagram OAuth must mirror it.

**Top risks for 2B:** credential fields in `payload_json`; OAuth failure → env fallback; stale credential binding in queue; token leakage via `last_error`/logs.

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2b-queue-exposure-matrix.md`](../../instagram/ig-auth-2b-queue-exposure-matrix.md) | 16-surface exposure matrix |
| [`ig-auth-2b-review-checklist.md`](../../instagram/ig-auth-2b-review-checklist.md) | PR review checklist — contract, resolver, no-fallback, stale jobs, compatibility |

## Queue surfaces audited

16 surfaces: queue row/retry/DLQ, outbox relay, worker logs, resolver, legacy IG config, ops API/UI, API errors, activity logs, fixtures, retention, metrics.

## Allowed queue fields

`provider`, `authFamily`, `deliveryPath`, `channelConnectionId`, `contractVersion`, existing message/job identifiers.

## Forbidden queue fields

`accessToken`, `ciphertext`, `authorizationCode`, `appSecret`, `verifyToken`, `secretFingerprint`, `rawProviderResponse`, `encryptionKey`, `Authorization`, decrypted material.

## Resolver trust boundaries

Input: `tenantId`, `channelConnectionId`, expected provider/auth family/delivery path. No account-only lookup, no tenant-global fallback, no OAuth ENV fallback, decrypt after scope validation, never log resolved object, lifecycle classification, sanitized errors, injected clock.

## No-fallback matrix

OAuth + DB_ONLY → resolve or fail. OAuth + ENV → **reject**. OAuth lifecycle states → config error / reauth / retryable. Legacy → unchanged when flag OFF. **No OAuth failure may use environment token.**

## Stale-job matrix

Job bound to connection A resolves current credential at execution (v5 after v4 rotation). Connection B becoming active does not redirect job A. DISCONNECTED → explicit failure. REAUTH_REQUIRED → reauth classification, no env fallback.

## Backward compatibility

Existing jobs without binding parse under flag OFF. No queue DB migration. Missing binding ≠ OAuth. Rolling deployment compatibility must be documented or flag stays blocker.

## Phase 10 — After Agent A PR

Separate worktree; review scope, contract, secrets, isolation, no-fallback, stale jobs, flags, scans, full suite. Verdict PASS / PASS WITH NOTES / CHANGES REQUESTED / BLOCKED. Do not merge.

## Remaining unknowns

Exact payload shape, resolver module location, flag names, rolling deployment matrix — await Agent A PR.

## Scope confirmation

Docs/security review preparation only. No resolver, queue, worker, OAuth routes, UI/API, env, deployment, or merge.

## Verification

`git diff --check`, 3 docs only, hidden/bidi scan, secret scan at commit time.
