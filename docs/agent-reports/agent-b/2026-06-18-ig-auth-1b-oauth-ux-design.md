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
| Base master SHA | `54f9389494e4038d4e63106c2ceb94ac332fafc2` |
| Upstream audits | IG-AUTH-0 (Agent A, PR #238), IG-AUTH-0B (Agent B, PR #239) |
| Parallel owner | Agent A — backend architecture, schema, token lifecycle, resolver, migration mechanics |
| Primary docs | `docs/instagram/ig-oauth-operator-journeys.md`, `ig-oauth-ui-state-matrix.md`, `ig-oauth-safe-api-contract.md`, `ig-oauth-test-plan.md` |

## Executive summary

This deliverable defines the **target operator experience** for Instagram OAuth migration: connect, identity, permissions, token health, reauthorization, structured errors, disconnect, and **non-destructive legacy migration**. It mirrors proven Facebook OAuth UX patterns (`FacebookConnectCard.tsx`, `facebookConnectModel.ts`) while fixing IG-AUTH-0B gaps (no OAuth card, `Facebook Page ID` label confusion, no credential-source indicator, collapsed failure states).

**Design constraints (non-negotiable):**

- No raw token entry for **new** OAuth connections
- No token displayed after callback
- Connection identity must be explicit (Instagram username + masked professional account ID)
- Credential source observable but sanitized (`OAuth` / `Legacy` / `Environment fallback` — server-derived only)
- Test connection and runtime status must align (addresses IG-AUTH-0 P1-4)
- Legacy and OAuth states must **not** look identical
- No destructive migration without confirmation and rollback path

**Current baseline (IG-AUTH-0B):** ADMIN-only manual credentials on Channel Settings; `READY`/`ERROR` only; test reads DB; worker uses `DB_WITH_ENV_FALLBACK`.

## UX principles

| Principle | Design implication |
|-----------|-------------------|
| No raw token entry (new OAuth) | `Connect Instagram` replaces password fields for primary path; legacy manual collapsed under Advanced |
| No token after callback | Server exchanges code; UI polls session/status only |
| Explicit connection identity | Card shows IG display name + masked account ID, not Page ID as primary label |
| Observable credential source | `authMethod`, `credentialHealth.deliveryPath`, `migrationStatus` in safe DTO |
| Test/runtime alignment | Test connection uses same resolver path as worker when OAuth enabled (Agent A) |
| Legacy ≠ OAuth visually | Distinct badges: `CONNECTED_LEGACY` vs `CONNECTED`; migration banner |
| Non-destructive migration | Legacy remains active until cutover confirmed; rollback window |

## Current-to-target comparison

| Dimension | Current (IG-AUTH-0B) | Target (IG-AUTH-1B) |
|-----------|---------------------|---------------------|
| Primary action | Enter secrets + Save | Connect Instagram |
| Identity label | Facebook Page ID | Instagram account + optional "Linked Facebook Page — legacy only" |
| Auth method visibility | None | OAuth / Legacy badge |
| Credential health | SET/EMPTY only | Capability summary + expiry + refresh status |
| Failure states | Generic ERROR | Structured `safeErrorCode` taxonomy |
| Migration | N/A | Staged flow with canary + rollback |
| Test connection | DB-only probe | OAuth-aware health (aligned with runtime) |

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
| Agent A | Meta endpoints, permissions, token exchange, refresh lifecycle, schema, resolver, worker queue, webhook, feature flags |
| Agent B (this doc) | Operator journey, screen states, safe DTO requirements, error presentation, role UX, test-plan design, migration confirmation UX |

Items marked `PENDING_AGENT_A_ARCHITECTURE` in child docs require Agent A decisions before implementation.

## Security design findings (UX layer)

| ID | Finding | Mitigation in design |
|----|---------|---------------------|
| S1 | OAuth callback query params may contain `code` | Strip from URL immediately after server handoff; never persist in localStorage |
| S2 | READY today may mask env fallback | `credentialHealth.deliveryPath` + `authMethod` required in status DTO |
| S3 | Legacy manual path retains token paste | Collapsed Advanced only; banner warns legacy is being retired |
| S4 | Generic errors hide revoke/expiry | Structured `safeErrorCode` with operator playbook links |

No P0 browser credential leakage in **current** implementation (IG-AUTH-0B). Target design preserves write-only + no-token DTO rules.

## Unknowns / PENDING_AGENT_A_ARCHITECTURE

See per-document markers. Summary:

- Exact Meta OAuth permission set and App Review gating
- Token duration and refresh schedule
- Canary feature flag name and cutover mechanics
- Whether webhook verify/app secret remain platform ENV during OAuth migration
- Per-tenant resolver flag defaults in production

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
