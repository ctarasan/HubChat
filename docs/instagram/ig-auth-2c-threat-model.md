# IG-AUTH-2C — OAuth Threat Model

Audit baseline: master `e480f07` (post PR #245 merge). **Status:** implementation merged; connect flag default OFF.

References: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md) ADR-4/5, [`ig-oauth-token-lifecycle.md`](ig-oauth-token-lifecycle.md), Agent A report [`2026-06-18-ig-auth-2c-oauth-state-start-callback.md`](../agent-reports/agent-a/2026-06-18-ig-auth-2c-oauth-state-start-callback.md).

---

## Control classification legend

| Class | Meaning |
|-------|---------|
| **Implemented** | Present in merged master code |
| **Verified** | Confirmed by Agent B code review + tests (PR #245 PASS) |
| **Deferred** | Planned IG-AUTH-2D+ phase |
| **Operational** | Requires production config/flag/smoke before enablement |

---

## Final threat matrix

| Threat | Final control | Evidence |
| ------ | ------------- | -------- |
| Login CSRF | One-time state bound to tenant + `channel_connection_id` + INSTAGRAM provider | `instagramOAuthConnectService.startOAuth` + `instagram_oauth_states` composite FK — **Verified** |
| State fixation | Server CSPRNG state only; client cannot set state | `generateInstagramOAuthState()` — `instagramOAuthSecurity.test.ts` — **Verified** |
| State disclosure | SHA-256 hash at rest; no raw state in logs/audit/redirect | `createState` stores `state_hash`; `instagramOAuthAudit.ts` forbidden keys — **Verified** |
| Replay | Atomic claim `PENDING` → `CLAIMED` before exchange; finalize `CONSUMED`/`FAILED` | `claimStateAtCallback` conditional UPDATE — `supabaseInstagramOAuthStateRepository.test.ts` — **Verified** |
| Cross-tenant binding | State row owns tenant+connection; lookup by hash only | Composite FK `instagram_oauth_states_tenant_connection_fk` — **Verified** |
| Privilege escalation | ADMIN-only start | `requireAuth(req, ["ADMIN"])` — `instagramOAuthRoutes.test.ts` — **Verified** |
| Open redirect | Fixed `CHANNEL_SETTINGS` destination enum; `assertInstagramOAuthRedirectUrlSafe` | `instagramOAuthRedirect.ts` — route callback test — **Verified** |
| Code leak | No log/persist/redirect of authorization code | Callback redirect guard; no code column in schema — **Verified** |
| Token leak | Server-only exchange; encrypt before DB persist | `instagramBusinessLoginOAuth.ts` + IG-AUTH-2A `activate` — **Verified** |
| Scope injection | Server allowlist only | `INSTAGRAM_OAUTH_CONNECT_SCOPES` in `instagramOAuthConfig.ts` — start strict zod body — **Verified** |
| Endpoint injection | Fixed provider HTTPS hosts | `INSTAGRAM_OAUTH_*_HOST` constants — `instagramBusinessLoginOAuth.test.ts` — **Verified** |
| Callback ambiguity | Strict parser; `code`+`error` fails closed | `instagramOAuthConnectService.handleCallback` — **Implemented** (service test gap for code+error — non-blocking) |
| Parallel callback race | One atomic claim succeeds | `claimStateAtCallback allows only one concurrent claim` test — **Verified** |
| Silent credential overwrite | ACTIVE/TOKEN_EXPIRING/REFRESHING rejected; REAUTH in place | `isBlockingExistingCredential` + `INSTAGRAM_OAUTH_ALREADY_CONNECTED` — **Verified** |
| Flag bypass | Connect flag on start and callback (post-claim) | `isInstagramOAuthConnectEnabled` + availability check — flag-OFF callback test — **Verified** |
| Runtime cutover | No worker/adapter/queue wiring | `instagramOAuthRoutes.test.ts` worker regression — **Verified** |
| SSRF | No user-controlled provider URL | Fixed hosts + `redirect: manual` — **Verified** |
| Provider-error reflection | Sanitized `errorCode` in redirect only | `instagramOAuthConnectErrors.ts` + `sanitizeProviderErrorMessage` — **Verified** |
| Instagram Basic Display confusion | Business Login endpoints/scopes only | Agent A report cites official Meta Business Login doc — **Verified** |
| PKCE absence | Not sent; documented per ADR-4 | No `code_challenge` in authorize URL builder — **Verified** |

---

## Implemented controls (merged master)

### Routes and flag

```text
POST /api/channel-connect/instagram/oauth/start
GET  /api/channel-connect/instagram/oauth/callback
HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED — default OFF
```

### State model (`instagram_oauth_states`)

| Field | Purpose |
|-------|---------|
| `state_hash` | SHA-256 of opaque browser state (unique index) |
| `tenant_id` + `channel_connection_id` | Composite FK to `channel_connections` |
| `return_destination` | Fixed enum (`CHANNEL_SETTINGS` only) |
| `requested_scopes` | Server-approved scope snapshot |
| `status` | `PENDING` → `CLAIMED` → `CONSUMED` \| `FAILED` |
| `claimed_at` / `consumed_at` | One-time lifecycle timestamps |
| `expires_at` | 10-minute TTL |

No plaintext state, authorization code, access token, or App Secret columns.

### Atomic claim (before exchange)

```sql
UPDATE instagram_oauth_states
SET status = 'CLAIMED', claimed_at = now()
WHERE state_hash = ? AND provider = 'INSTAGRAM' AND status = 'PENDING'
  AND claimed_at IS NULL AND consumed_at IS NULL AND expires_at > now()
```

Unlike Facebook `oauth_transactions`, Instagram claims state **before** token exchange — reduces replay exchange window.

### Provider contract (official Meta Business Login)

| Step | Method | Endpoint |
| ---- | ------ | -------- |
| Authorize | GET redirect | `https://www.instagram.com/oauth/authorize` |
| Code exchange | POST form | `https://api.instagram.com/oauth/access_token` |
| Long-lived | GET | `https://graph.instagram.com/{version}/access_token?grant_type=ig_exchange_token` |

Scopes: `instagram_business_basic`, `instagram_business_manage_messages`.

PKCE: **not implemented** — Meta docs checked 2026-06-18; no `code_challenge` documented.

### Credential persistence

| Scenario | Behavior |
| -------- | -------- |
| New connection | `createPending` → exchange → `activate` |
| REAUTH_REQUIRED / PENDING | `activate` in place on existing row |
| ACTIVE / TOKEN_EXPIRING / REFRESHING | Reject `INSTAGRAM_OAUTH_ALREADY_CONNECTED` |

---

## Deferred controls (IG-AUTH-2D+)

| Control | Phase |
| ------- | ----- |
| Channel Settings OAuth UI | IG-AUTH-2D+ |
| Test Connection parity | IG-AUTH-2D |
| DM adapter OAuth delivery | IG-AUTH-2E |
| Token refresh scheduler | IG-AUTH-2H |
| Legacy credential retirement | IG-AUTH-2I |
| Queue binding emission | Post-runtime cutover phase |
| Callback `Cache-Control: no-store` on redirect | Optional hardening follow-up |

---

## Operational controls required before production enablement

- Execute `instagram_oauth_states` migration in target environment
- Register exact production callback URL in Meta app
- Configure production App ID / App Secret (env only — not in repo)
- Meta App Review for required permissions
- Controlled `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED=true` smoke
- Operator connect/reconnect runbook
- Log/secret leak monitoring on first flag-on
- Rollback procedure documented

**Not claimed:** production smoke, live Meta flow, or App Review approval.

---

## Reuse-risk table (Facebook → Instagram) — resolved

| Facebook pattern | Instagram implementation | Resolution |
| ---------------- | ------------------------ | ---------- |
| `oauth_transactions` | Dedicated `instagram_oauth_states` | **RESOLVED BY PR #245** — simpler connect-only model |
| 15m state TTL | 10m TTL | **RESOLVED** — documented in `instagramOAuthSecurity.ts` |
| Page picker + resume cookie | Direct credential activation | **RESOLVED** — no page picker |
| `errorCategory` redirect param | `instagramOAuth` + `errorCode` | **RESOLVED** — `instagramOAuthRedirect.ts` |

---

## Token/code exposure surfaces

| Surface | Merged status |
| ------- | ------------- |
| Start response | `okNoStore` + `assertInstagramOAuthStartResponseSafe` |
| Callback redirect | No code/state/token in Location |
| Audit events | Forbidden key guard in `emitInstagramOAuthAudit` |
| State DB row | Hash only |
| Credential row | Ciphertext via canonical encryption |
| Worker logs | No Instagram OAuth connect imports |
