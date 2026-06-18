# Agent B — IG-AUTH-1B Instagram OAuth UX & Operator Migration Design

## Status

Complete — docs/UX design only (no product runtime changes).

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-1B |
| Date | 2026-06-18 |
| Branch | `docs/ig-auth-1b-oauth-ux-design` |
| Base master SHA | `19d6b5935a568393c2b75ad10fe8f437233b33d7` |
| Upstream audits | IG-AUTH-0 (PR #238), IG-AUTH-0B (PR #239), **IG-AUTH-1A (PR #241)** |
| Architecture source of truth | [`ig-oauth-architecture-adr.md`](../../instagram/ig-oauth-architecture-adr.md) (merged on master) |
| Primary docs | `docs/instagram/ig-oauth-operator-journeys.md`, `ig-oauth-ui-state-matrix.md`, `ig-oauth-safe-api-contract.md`, `ig-oauth-test-plan.md` |

## Executive summary

This deliverable defines the **target operator experience** for migrating from the current **Facebook Page-linked legacy path** to **Business Login for Instagram** with an **Instagram User access token** on `graph.instagram.com`. It mirrors proven Facebook OAuth UX patterns (`FacebookConnectCard.tsx`, `facebookConnectModel.ts`) while fixing IG-AUTH-0B gaps.

**Target auth family (IG-AUTH-1A):** Business Login for Instagram → Instagram User access token → Instagram Professional Account identity. Legacy Page-token path is **temporary migration compatibility only** for existing connections — not the target for new connects.

**Design constraints (non-negotiable):**

- No raw token entry for **new** OAuth connections
- No token displayed after callback; frontend never handles token refresh
- Connection identity must be explicit (Instagram username + masked Professional Account ID)
- Credential source observable but sanitized — server-derived `authMethod` + `credentialHealth.deliveryPath` only
- **OAuth-managed connections (`authMethod=OAUTH`) must never show `ENVIRONMENT_FALLBACK` delivery**
- Test connection and runtime share same resolver + `channel_connection_id` (IG-AUTH-1A ADR-7)
- Legacy and OAuth states must **not** look identical
- No destructive migration without confirmation and rollback path

**Current baseline (IG-AUTH-0B):** ADMIN-only manual credentials on Channel Settings; `READY`/`ERROR` only; test reads DB; worker uses `DB_WITH_ENV_FALLBACK`.

## UX principles

| Principle | Design implication |
|-----------|-------------------|
| No raw token entry (new OAuth) | `Connect Instagram` replaces password fields for primary path; legacy manual collapsed under Advanced |
| No token after callback | Server exchanges code; UI polls session/status only |
| Explicit connection identity | Card shows IG display name + masked account ID, not Page ID as primary label |
| Observable credential source | `authMethod`, `credentialHealth.deliveryPath` — server only; OAuth + ENV fallback is invalid |
| Test/runtime alignment | Same resolver + `channel_connection_id` per IG-AUTH-1A ADR-7 |
| Legacy ≠ OAuth visually | Distinct badges: `CONNECTED_LEGACY` vs `CONNECTED`; migration banner |
| Non-destructive migration | Legacy active until cutover; 14-day evidence window before retire |

## Current-to-target comparison

| Dimension | Current (IG-AUTH-0B) | Target (IG-AUTH-1B) |
|-----------|---------------------|---------------------|
| Primary action | Enter secrets + Save | Connect Instagram |
| Identity label | Facebook Page ID | Instagram account + optional "Linked Facebook Page — legacy only" |
| Auth method visibility | None | OAuth / Legacy badge |
| Credential health | SET/EMPTY only | Capability summary + expiry + refresh status |
| Failure states | Generic ERROR | Structured `safeErrorCode` taxonomy |
| Migration | N/A | Staged flow with canary + rollback |
| Test connection | DB-only probe | OAuth-aware health via unified resolver (same as runtime) |

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-oauth-operator-journeys.md`](../../instagram/ig-oauth-operator-journeys.md) | 12 operator journeys + confirmation copy |
| [`ig-oauth-ui-state-matrix.md`](../../instagram/ig-oauth-ui-state-matrix.md) | 18 UI states with badge, actions, API deps |
| [`ig-oauth-safe-api-contract.md`](../../instagram/ig-oauth-safe-api-contract.md) | Frontend DTOs, polling, prohibited fields |
| [`ig-oauth-test-plan.md`](../../instagram/ig-oauth-test-plan.md) | Unit, API contract, E2E, production smoke matrices |

## Connection card information architecture

Proposed `InstagramConnectCard` (parallel to `FacebookConnectCard`):

```text
┌─ Instagram Connection ─────────────────────────────────────┐
│ [Badge: CONNECTED | CONNECTED_LEGACY | REAUTH_REQUIRED …]   │
│ @instagram_username · Professional account ···1234         │
│ Auth: OAuth │ Capabilities: Messaging · Comments · Profile   │
│ Credential health: Healthy │ Expires: 2026-09-01 (server)  │
│ Delivery path: OAuth │ Last test: PASS · 2h ago              │
│ Migration: Complete │ Legacy credential: Retired             │
│ [Reauthorize] [Test connection] [Disconnect] [⋯ Migrate]     │
└────────────────────────────────────────────────────────────┘
```

**Label rule:** Never use "Facebook Page ID" as primary Instagram identity. Legacy Page association: **"Linked Facebook Page — legacy connection only"**.

## Coordination boundary

| Owner | Scope |
|-------|-------|
| Agent A (IG-AUTH-1A merged) | Target auth family, resolver policy, token lifecycle, webhook separation, rollout phases |
| Agent B (this doc) | Operator journey, screen states, safe DTO requirements, error presentation, role UX, test-plan design, migration confirmation UX |

## OAuth delivery-path invariant (UX)

For OAuth-managed Instagram connections, the UI must **never** present a healthy OAuth connection when runtime uses environment fallback:

| authMethod | deliveryPath | Valid for healthy OAuth UI? |
|------------|--------------|----------------------------|
| `OAUTH` | `OAUTH_DB` | Yes |
| `OAUTH` | `LEGACY_DB` | No → `CONFIGURATION_ERROR` or `REAUTH_REQUIRED` |
| `OAUTH` | `ENVIRONMENT_FALLBACK` | **No** — invalid combination |
| `LEGACY` | `LEGACY_DB` | Yes |
| `LEGACY` | `ENVIRONMENT_FALLBACK` | Temporary migration-only (legacy connections) |

Frontend does not select delivery path — server status DTO only.

## Monitoring windows (operational vs architecture)

```text
Operational checkpoints after canary cutover: 24h, 48h, 72h
Architecture evidence window before legacy retirement: 14 days (IG-AUTH-1A Phase 8)
```

The first 24–72 hours are **operational monitoring checkpoints** only. They do **not** authorize legacy credential retirement. Legacy retirement requires completion of the full **14-day architecture evidence window** unless a later approved rollout decision changes that duration.

## Cross-reference — IG-AUTH-1A (merged on master)

IG-AUTH-1A OAuth Architecture is merged on master and is the **source of truth** for target auth family, connection binding, resolver policy, token lifecycle, webhook separation, and rollout phases.

**Cross-confirmed with merged IG-AUTH-1A:**

- Target auth family is **Business Login for Instagram** with an **Instagram User access token**
- OAuth-managed credentials are **DB-bound** to `channel_connection_id`
- OAuth-managed connections **must not** use silent environment fallback
- Test connection and runtime use the **same resolver and connection identity**
- Token lifecycle and refresh are **server-owned** (`grant_type=ig_refresh_token` is a Meta grant action, not a refresh-token credential)
- Webhook HMAC remains **app-level**; access tokens remain **connection-level**
- Legacy retirement requires the **14-day evidence window**

IG-AUTH-1B (this deliverable) remains **in review** until PR #240 merges.

## Security design findings (UX layer)

| ID | Finding | Mitigation in design |
|----|---------|---------------------|
| S1 | OAuth callback query params may contain `code` | Strip from URL immediately after server handoff; never persist in localStorage |
| S2 | READY today may mask env fallback | `credentialHealth.deliveryPath` + `authMethod`; reject OAUTH + ENVIRONMENT_FALLBACK |
| S3 | Legacy manual path retains token paste | Collapsed Advanced only; banner warns legacy is being retired |
| S4 | Generic errors hide revoke/expiry | Structured `safeErrorCode` with operator playbook links |

No P0 browser credential leakage in **current** implementation (IG-AUTH-0B). Target design preserves write-only + no-token DTO rules.

## Remaining unknowns (post IG-AUTH-1A)

| Topic | Missing evidence |
|-------|------------------|
| Production App Review approval for `instagram_business_*` scopes | Meta App Dashboard (not in repo) |
| Production `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` state | Runtime flag per tenant |
| Production credential store population (`channel_settings` vs `channel_connections`) | Tenant inventory |
| Source Post media field parity on `graph.instagram.com` | Implementation-phase Meta validation |
| Customer IGSID profile endpoint on Instagram Login Graph | Implementation-phase Meta validation |
| PKCE support for Business Login | Not documented by Meta (2026-06-18) |
| Exact token transport per target Graph endpoint | Verify Bearer vs query `access_token` per official doc at implementation |
| Final OAuth route prefix | **IG-AUTH-2C** decision — preferred `channel-connect`; `channel-connections` alternative requires explicit review |
| Multi-IG account per Meta login (account picker) | Product + provider behavior |
| Disconnect Meta token revocation semantics | Provider doc confirmation at implementation |

## Scope confirmation

```text
Docs/UX design only.
No frontend runtime change.
No API/test-code change.
No schema/migration change.
No environment or credential change.
No OAuth implementation.
No deployment.
```

## Verification

Run at commit time: `git diff --check`, docs-only diff, hidden/bidi scan, secret scan.
