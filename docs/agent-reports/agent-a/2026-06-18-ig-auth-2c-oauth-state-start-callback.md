# IG-AUTH-2C — Instagram OAuth State / Start / Callback Foundation

> **Agent:** A
> **Date:** 2026-06-18
> **Branch:** `feature/ig-auth-2c-oauth-state-start-callback`
> **Base master SHA:** `ea9451571e7b56792746c53279dda5de681bca05`

---

## Official Meta docs checked

| Item | Value |
| --- | --- |
| Source | [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login) |
| Checked | 2026-06-18 (aligned with `docs/instagram/ig-oauth-token-lifecycle.md`) |
| Authorization | `GET https://www.instagram.com/oauth/authorize` |
| Code exchange | `POST https://api.instagram.com/oauth/access_token` (`application/x-www-form-urlencoded`) |
| Long-lived exchange | `GET https://graph.instagram.com/{version}/access_token?grant_type=ig_exchange_token` |
| Short-lived TTL | ~1 hour |
| Long-lived TTL | 60 days (`expires_in` seconds) |
| Code TTL | ~1 hour, single-use |
| PKCE | **Not used** — not documented for Instagram Business Login; security relies on high-entropy one-time state, exact redirect URI, server-side client secret, and authorization-code single-use semantics |

---

## Route prefix decision

Uses the same `channel-connect` family as Facebook OAuth:

```text
POST /api/channel-connect/instagram/oauth/start
GET  /api/channel-connect/instagram/oauth/callback
```

**Reason:** Matches existing Facebook Channel Connect OAuth layout; no alias routes; no browser token ingestion endpoints.

---

## Existing Facebook OAuth reuse analysis

| Primitive | Facebook | Instagram (this phase) |
| --- | --- | --- |
| State entropy | 32-byte CSPRNG + SHA-256 hash | Reused pattern (`instagramOAuthSecurity.ts`) |
| State store | `oauth_transactions` (Facebook-specific page flow) | New `instagram_oauth_states` (simpler connect-only semantics) |
| Atomic claim | UPDATE … WHERE status=PENDING | Same pattern before token exchange |
| TTL | 15 minutes | **10 minutes** (documented; shorter connect-only window) |
| Auth on start | `requireAuth(req, ["ADMIN"])` | Same |
| Callback redirect | Channel Settings + sanitized query | `instagramOAuth=connected|error` + `errorCode` |
| Provider client | `facebookGraphOAuth.ts` | `instagramBusinessLoginOAuth.ts` |
| Credential store | Page token + transaction | IG-AUTH-2A `instagram_oauth_credentials` repository |

Facebook `oauth_transactions` was **not** extended because it is scoped to `FACEBOOK` provider, embeds page-selection fields, and couples to resume-session cookies.

---

## PKCE decision

**Not implemented.** Official Instagram Business Login documentation checked 2026-06-18 does not document PKCE for this flow. No undocumented `code_challenge` parameters are sent.

---

## State model

**Table:** `instagram_oauth_states`

| Field | Purpose |
| --- | --- |
| `state_hash` | SHA-256 of opaque browser state (unique) |
| `tenant_id` + `channel_connection_id` | Composite FK to `channel_connections` |
| `return_destination` | Fixed enum (`CHANNEL_SETTINGS`) |
| `requested_scopes` | Server-approved scopes snapshot |
| `status` | `PENDING` → `CLAIMED` → `CONSUMED`/`FAILED` |
| `claimed_at` / `consumed_at` | One-time lifecycle timestamps |
| `expires_at` | 10-minute TTL |

No plaintext state, authorization code, access token, or App Secret stored.

---

## Atomic state claim

```text
hash(state)
→ UPDATE instagram_oauth_states
    SET status='CLAIMED', claimed_at=now()
  WHERE state_hash=? AND provider='INSTAGRAM' AND status='PENDING'
    AND claimed_at IS NULL AND consumed_at IS NULL AND expires_at > now()
→ exactly one row OR reject (invalid/expired/replayed)
→ token exchange
→ finalize CONSUMED or FAILED (never returns to PENDING)
```

Replay attempts after claim map to `INSTAGRAM_OAUTH_STATE_REPLAYED`.

---

## Start authorization

- `POST` with JSON `{ channelConnectionId, returnTo?: "CHANNEL_SETTINGS" }`
- `requireAuth(req, ["ADMIN"])`, active sales agent required
- Tenant from auth principal only
- Validates Instagram connection ownership
- Rejects `ACTIVE`/`TOKEN_EXPIRING`/`REFRESHING` credentials (`ALREADY_CONNECTED`)
- Response: `{ authorizationUrl, expiresAt }` with `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`
- No state, verifier, or secrets in response body

---

## Callback validation

Accepts provider query fields only: `code`, `state`, `error`, `error_reason`, `error_description`.

- `state` required on all paths
- Success requires non-empty `code` and no provider error
- Denial path does not exchange tokens
- Ambiguous `code` + `error` fails closed
- Max parameter length 2048
- No logging of code/state/raw query

---

## Token exchange flow

1. Atomic state claim
2. `POST api.instagram.com/oauth/access_token` (form body, server secret)
3. `GET graph.instagram.com/.../access_token?grant_type=ig_exchange_token` for long-lived token
4. Encrypt + activate credential via IG-AUTH-2A repository
5. Finalize state `CONSUMED`

Authorization code exists only in memory for the exchange request.

---

## Initial long-lived-token behavior

Short-lived token from code exchange is immediately exchanged for a 60-day long-lived token per official Meta flow. `token_expires_at` computed from `expires_in` when present; `refresh_eligible_at = now + 24h`.

---

## Scope allowlist

Server-controlled (`instagramOAuthConfig.ts`):

- `instagram_business_basic`
- `instagram_business_manage_messages`

`instagram_business_manage_comments` deferred to IG-AUTH-2F private-reply phase.

---

## Credential persistence / reconnect behavior

| Scenario | Behavior |
| --- | --- |
| No active-like row | `createPending` → `activate` (`INSTAGRAM_BUSINESS_LOGIN`) |
| `REAUTH_REQUIRED` / `PENDING` | `activate` in place on existing row |
| `ACTIVE` / `TOKEN_EXPIRING` / `REFRESHING` | Reject `INSTAGRAM_OAUTH_ALREADY_CONNECTED` |
| Stale version | `INSTAGRAM_OAUTH_CREDENTIAL_CONFLICT` |

Plaintext tokens never persisted; ciphertext via canonical encryption helper.

---

## Redirect / open-redirect controls

Fixed internal map: `CHANNEL_SETTINGS` → `/dashboard/channel-settings?channel=instagram&instagramOAuth=…`

No user-supplied absolute URLs. Application base URL from trusted config only. Callback uses `303 See Other`.

---

## Error taxonomy

Implemented in `instagramOAuthConnectErrors.ts` — public codes include `INSTAGRAM_OAUTH_DISABLED`, `INSTAGRAM_OAUTH_STATE_*`, `INSTAGRAM_OAUTH_ACCESS_DENIED`, `INSTAGRAM_OAUTH_EXCHANGE_FAILED`, `INSTAGRAM_OAUTH_ALREADY_CONNECTED`, `INSTAGRAM_OAUTH_CREDENTIAL_CONFLICT`, `INSTAGRAM_OAUTH_PERSISTENCE_FAILED`, and others per spec.

---

## Audit secrecy

`instagramOAuthAudit.ts` emits sanitized events (`INSTAGRAM_OAUTH_STARTED`, `INSTAGRAM_OAUTH_CALLBACK_*`, `INSTAGRAM_OAUTH_STATE_REPLAY_REJECTED`). Forbidden metadata keys enforced at runtime.

---

## Feature flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | OFF | Start/callback routes |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | OFF | Unchanged; not used for connect |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | OFF | Unchanged from IG-AUTH-2A |

---

## Runtime no-change evidence

- No worker/adapter/resolver wiring added
- No OAuth queue emission
- No Channel Settings UI changes
- No Test Connection changes
- `worker/main.ts` regression test asserts no connect service import

---

## Tests

| Area | File |
| --- | --- |
| Security/state | `instagramOAuthSecurity.test.ts` |
| Flags/config | `instagramOAuthConnectFlags.test.ts`, `instagramOAuthConfig.test.ts` |
| Provider client | `instagramBusinessLoginOAuth.test.ts` |
| State repository | `supabaseInstagramOAuthStateRepository.test.ts` |
| Connect service | `instagramOAuthConnectService.test.ts` |
| Routes | `instagramOAuthRoutes.test.ts` |

---

## Deferred work

- IG-AUTH-2D identity verification / Test Connection
- IG-AUTH-2E DM adapter cutover
- IG-AUTH-2F private reply (`instagram_business_manage_comments`)
- IG-AUTH-2G Source Post / profile parity
- IG-AUTH-2H refresh scheduler
- IG-AUTH-2I rollout / legacy retirement
- Channel Settings OAuth UI
- Disconnect/revoke UI
- Multi-account picker

---

## Scope confirmation

OAuth state/start/callback foundation only.
No Instagram message delivery.
No production resolver/worker/adapter cutover.
No OAuth queue emission.
No Test Connection change.
No Channel Settings UI change.
No refresh scheduler.
No legacy credential retirement.
No production environment or credential change.
No production migration execution.
No deployment.
No merge performed.
