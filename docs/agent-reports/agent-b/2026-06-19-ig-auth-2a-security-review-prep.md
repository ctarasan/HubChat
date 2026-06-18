# Agent B — IG-AUTH-2A-B Security Exposure Audit & Review Preparation

## Status

Complete — docs/audit only (no product runtime changes). Awaiting Agent A IG-AUTH-2A implementation PR.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-2A-B |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2a-b-security-review-prep` |
| Base master SHA | `7c3435b` (IG-AUTH-1B merged, PR #240) |
| Parallel owner | Agent A — IG-AUTH-2A schema/repository foundation |
| Architecture source | [`ig-oauth-architecture-adr.md`](../../instagram/ig-oauth-architecture-adr.md) (IG-AUTH-1A, PR #241) |
| UX design source | IG-AUTH-1B safe API contract (PR #240) |
| Primary docs | [`ig-auth-2a-public-exposure-matrix.md`](../../instagram/ig-auth-2a-public-exposure-matrix.md), [`ig-auth-2a-review-checklist.md`](../../instagram/ig-auth-2a-review-checklist.md) |

## Executive summary

Agent A is implementing **IG-AUTH-2A** — additive schema and repository foundation for Instagram OAuth credentials. Agent B audited **latest master** for credential-related data that could leak through public HTTP surfaces, frontend mappers, browser storage, logs, and test fixtures.

**Phase 2A constraint:** Public API and Instagram Channel Settings UI must remain **unchanged**. IG-AUTH-2A is internal persistence only until later phases wire OAuth routes and safe DTOs.

**Current baseline (master):**

- Instagram operators use **manual Channel Settings** only (`channel_settings.secret_json` server-side; API returns `secretState` SET/EMPTY).
- Facebook OAuth uses `channel_connections` + `channel_credentials` with established public DTO guards (`channelConnectionPublicDto.ts`, `assertFacebookOAuthPublicDtoSafe`).
- Instagram has **no** `/api/channel-connect/instagram/*` routes and **no** OAuth UI.

**Highest-risk future exposure paths** when IG-AUTH-2A columns land:

1. Accidental `select("*")` or row spread into HTTP responses
2. New OAuth metadata (`granted_scopes`, `provider_user_id`, `credential_version`, refresh errors) leaking via status APIs before safe DTO design (IG-AUTH-1B)
3. `token_expires_at` already exposed for Facebook credential metadata — must not expose ciphertext or internal refresh diagnostics on Instagram paths prematurely
4. Repository methods without tenant + `channel_connection_id` scoping
5. ENV fallback wired into OAuth-managed credential reads (forbidden per IG-AUTH-1A ADR-6)

No P0 credential leakage found in **current** Instagram public paths. Existing protections (`SAFE_LIST_SELECT`, `toChannelSettingPublicDto`, `FORBIDDEN_LEAK_PATTERNS`) must be preserved and extended in Agent A PR.

## Deliverable index

| Document | Contents |
|----------|----------|
| [`ig-auth-2a-public-exposure-matrix.md`](../../instagram/ig-auth-2a-public-exposure-matrix.md) | Surface-by-surface exposure audit with risk from new OAuth columns |
| [`ig-auth-2a-review-checklist.md`](../../instagram/ig-auth-2a-review-checklist.md) | Agent A PR review checklist — schema, repository, tests |

## Phase 1 — Exposure audit summary

Audited surfaces: Channel Settings GET/PATCH, test-connection, Facebook OAuth status (reference pattern), channel connection public DTO, analytics/ops, retention purge DTOs, frontend mappers, React state, browser storage, E2E fixtures.

**Surfaces audited:** 14  
**Potential exposure paths identified:** 9 (see matrix doc)  
**Existing protections:** `SAFE_LIST_SELECT` excludes `secret_json`; `CHANNEL_CREDENTIAL_METADATA_SELECT` excludes `encrypted_secret_value`; `assertPublicConnectionDtoSafe` / `assertFacebookOAuthPublicDtoSafe`; `sanitizePublicConfigJson`; `FORBIDDEN_LEAK_PATTERNS` in `channelSettingsModel.ts`

Full matrix: [`ig-auth-2a-public-exposure-matrix.md`](../../instagram/ig-auth-2a-public-exposure-matrix.md).

## Phase 2 — Prohibited public fields

These must **never** appear in HTTP JSON to browsers, frontend parsers, analytics, or ops dashboards:

```text
access_token_ciphertext
encrypted_secret_value
accessToken
authorizationCode
appSecret
webhookVerifyToken
ciphertext
plaintextSecret
secret_json
rawProviderResponse
providerAccessToken
longLivedToken
shortLivedToken
refreshToken
credentialVersion (internal optimistic-lock field)
internal refresh error bodies
encryption metadata (key id, IV, algorithm details beyond "configured")
decrypted token material in any form
```

### Sanitized future fields (IG-AUTH-1B contract — not in phase 2A public API)

Expose only via future safe DTOs after explicit contract approval:

```text
authMethod
status (display state)
providerAccountIdMasked
tokenExpiresAt
lastRefreshAt
lastRefreshStatus
credentialHealth
migrationStatus
safeErrorCode
```

Phase 2A: **no new public fields** on existing Channel Settings or Instagram endpoints.

## Phase 3 — Migration/repository review checklist

Prepared in [`ig-auth-2a-review-checklist.md`](../../instagram/ig-auth-2a-review-checklist.md).

Key gates for Agent A PR:

- Additive migration only; no plaintext token columns; no secret backfill
- `tenant_id` + `channel_connection_id` on all credential operations
- No tenant-global credential lookup for Instagram OAuth path
- No environment fallback in repository reads
- Internal vs public model separation; optimistic locking via `credential_version`
- Public DTO builders unchanged for Channel Settings

## Phase 4 — No-change frontend regression

IG-AUTH-2A merge must **not** change operator-visible Instagram behavior.

### Must remain unchanged

| Area | Current behavior |
|------|------------------|
| Instagram Channel Settings card | Manual legacy fields (access token, verify token, app secret, Page ID, account label) |
| Status mapping | `NOT_CONFIGURED` / `DISABLED` / `READY` / `ERROR` only |
| Test Connection | POST empty body; DB `channel_settings` probe only |
| OAuth UI | None — no Connect Instagram button, no OAuth states |
| Token expiry UI | None |
| Migration UI | None |
| Role policy | ADMIN write; MANAGER/SALES denied on channel settings |

### Post-merge smoke checklist (staging/local — not production)

```text
[ ] ADMIN Channel Settings loads
[ ] Instagram card unchanged (manual fields, labels, badges)
[ ] GET /api/channel-settings contains no OAuth secret/internal fields
[ ] GET /api/channel-settings/instagram — same DTO shape as pre-merge
[ ] PATCH legacy credential still behaves unchanged (secretState SET/EMPTY only in response)
[ ] POST /api/channel-settings/instagram/test-connection unchanged
[ ] MANAGER/SALES access unchanged (403 on channel settings)
[ ] No new Instagram OAuth network calls
[ ] No console errors on Channel Settings load/save/test
[ ] Network panel: no access_token, ciphertext, credential_version, granted_scopes in responses
[ ] React state: secretInputs still transient; no new localStorage keys for IG credentials
```

## Phase 5 — Security test recommendations

Recommend Agent A PR include (or reference for IG-AUTH-2A-C):

| ID | Test | Assert |
|----|------|--------|
| T-01 | Repository retrieve wrong tenant | Throws / not found; no cross-tenant row |
| T-02 | Repository retrieve wrong connection | Throws / not found |
| T-03 | Duplicate active credential insert | Constraint or guard rejects |
| T-04 | Optimistic lock version conflict | Second write fails safely |
| T-05 | `listByTenant` / public mapper | Token never in serialized output |
| T-06 | Channel Settings GET unchanged | Snapshot or field allowlist match pre-2A |
| T-07 | Generated Supabase row spread guard | `...row` into response fails test |
| T-08 | Decrypt error path | Sanitized message; no ciphertext in error |
| T-09 | Log capture on credential store | No plaintext token in stdout/stderr fixtures |
| T-10 | Migration SQL review | No `UPDATE` setting tokens; no destructive DDL |

## Phase 6 — After Agent A opens PR

When Agent A opens the IG-AUTH-2A PR:

1. `git fetch origin` and create separate worktree
2. Review SQL migration against schema checklist
3. Review repository methods for tenant + connection scoping
4. Confirm **no** route handler or DTO changes (or flag as scope violation)
5. Run hidden/bidi and secret scans on PR diff
6. Verdict: **PASS** | **PASS WITH NOTES** | **CHANGES REQUESTED** | **BLOCKED**
7. Do **not** merge

## Cross-reference — architecture expectations (IG-AUTH-1A)

Logical fields Agent A may add (repository-internal until later phases):

```text
auth_family / auth_method
provider_user_id
credential_version
granted_scopes
token_expires_at (metadata)
last_refresh_at / last_refresh_status (server-internal)
reauth_required_at
```

OAuth-managed connections: DB-bound credentials only; **no** `ENVIRONMENT_FALLBACK` with `authMethod=OAUTH` (IG-AUTH-1B invariant).

## Remaining unknowns

| Topic | Missing evidence |
|-------|------------------|
| Exact IG-AUTH-2A migration file names / column list | Agent A PR |
| Whether `channel_credentials` extensions are new table vs column adds | Agent A PR |
| Partial uniqueness index design for credential history | Agent A PR |
| Encryption key rotation story for new credential rows | Agent A implementation |
| Whether repository exposes any new read methods callable from routes | Agent A PR diff |

## Scope confirmation

```text
Docs/security review preparation only.
No schema or migration change.
No repository implementation.
No frontend/API behavior change.
No OAuth implementation.
No environment or credential change.
No deployment.
No merge performed.
```

## Verification

Run at commit time: `git diff --check`, docs-only diff (3 files), hidden/bidi scan, secret scan.
