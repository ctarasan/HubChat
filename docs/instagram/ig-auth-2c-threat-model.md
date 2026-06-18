# IG-AUTH-2C — OAuth Threat Model

Audit baseline: master `ea94515` (post IG-AUTH-2B). **Pre-2C:** Facebook OAuth is production reference; Instagram OAuth routes do not exist.

References: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md) ADR-4/5, [`ig-oauth-token-lifecycle.md`](ig-oauth-token-lifecycle.md), [`ig-oauth-safe-api-contract.md`](ig-oauth-safe-api-contract.md).

---

## Reuse-risk table (Facebook → Instagram)

| Existing pattern | Safe to reuse | Instagram-specific difference | Required verification |
| ---------------- | ------------- | ----------------------------- | --------------------- |
| `generateFacebookOAuthState()` (32-byte base64url) | Yes — extract shared helper or parallel | Same entropy/TTL requirements | Test state length/charset; no plaintext in DB |
| `hashFacebookOAuthSecret()` SHA-256 | Yes | Same | Assert only hash stored in `state_hash` |
| `oauth_transactions` + `consumeStateAtCallback` | Yes — extend provider enum | CHECK constraint currently `FACEBOOK` only; Instagram has no page-picker stage | Migration adds `INSTAGRAM`; atomic claim test |
| `requireAuth(req, ["ADMIN"])` on start | Yes | Start must also validate `channelConnectionId` ownership | Connection-bound, not tenant-global provider lookup |
| Unauthenticated callback route | Yes | State record is sole binding authority | Callback query cannot override tenant/connection |
| `buildFacebookOAuthChannelSettingsRedirectUrl` pattern | Yes — channel=`instagram` | Fixed path only; enum errorCategory | No code/state/token in Location |
| Callback unsafe-redirect guard | Yes | Extend regex guard | Test Location header |
| `facebookGraphOAuth.ts` client shape | Partial — structure only | **Different hosts:** `www.instagram.com` authorize, `api.instagram.com/oauth/access_token`, `graph.instagram.com/access_token` | Official doc URLs in PR; fixed host allowlist |
| Long-lived exchange | Partial | Instagram uses `grant_type=ig_exchange_token` on `graph.instagram.com` | Not Facebook `fb_exchange_token` |
| Resume session cookie + page picker | **No** for MVP | Instagram Business Login binds professional account directly | Do not copy Facebook multi-page flow unless scoped |
| `encrypted_user_token` on transaction | Maybe | Instagram may exchange to credential row immediately | Minimize interim plaintext lifetime |
| `assertFacebookOAuthPublicDtoSafe` | Yes — parallel Instagram assert | Extend forbidden patterns | Test snapshots |
| `resolveFacebookOAuthAppBaseUrl` | Yes | Same trusted origin for redirect | No Host-header-derived redirect |
| PKCE (`code_challenge`) | **No** unless Meta documents | ADR-4: Business Login params omit PKCE | Explicit absence doc + tests |
| `instagram_oauth_credentials` activate | Yes — from 2A | Callback writes ciphertext via canonical encryption | Version/status guards from 2A |
| Feature flag gating | Yes — new connect flag | `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` + foundation flags | Start+callback+exchange all gated |

---

## Threat matrix

| Threat | Attack | Required control | Test evidence (Agent A PR) |
| ------ | ------ | ---------------- | -------------------------- |
| Login CSRF | Attacker binds own IG account to victim tenant | One-time state bound to tenant + `channel_connection_id` + provider | Start creates transaction; callback rejects mismatched connection |
| State fixation | Attacker supplies chosen state | Server-generated CSPRNG state only; client never sets state | Start ignores client state; only server returns authorize URL |
| State theft | Logs/history expose state | SHA-256 hash at rest; no logging; 15m TTL | DB row has `state_hash` not plaintext; log grep tests |
| Replay | Callback URL reused | Atomic one-time claim (`PENDING` → `CALLBACK_RECEIVED`) | Parallel callback test: one succeeds, one conflict |
| Cross-tenant binding | State swapped across tenants | Transaction `tenant_id` + connection FK; lookup by state hash only | Wrong-tenant connection test |
| Open redirect | Arbitrary return URL | Fixed `/dashboard/channel-settings?channel=instagram` + enum params | Fuzz `returnTo`/Host/Referer rejected |
| Code leak | Code in logs/redirect/audit | Never log/persist/forward `code` | Redirect guard; no code in DTOs/errors |
| Token leak | Token in response/error/audit | Server-only exchange; encrypt before persist | Public DTO assert; no token in redirect |
| Scope injection | Client supplies permissions | Server allowlist scopes only | Start body strict; scopes from config |
| Endpoint injection | Client supplies host | Fixed official HTTPS hosts | URL builder unit tests |
| Callback confusion | `error`+`code` or missing fields | Strict parser; fail closed | Matrix tests per query shape |
| Parallel callback race | Two requests same state | `consumeStateAtCallback` conditional update | Race/integration test |
| Privilege escalation | SALES starts OAuth | `requireAuth(..., ["ADMIN"])` | MANAGER/SALES → 403 |
| Session swapping | Callback session differs from initiator | State owns tenant; not callback session | Logged-out callback safe; resume cookie optional |
| Credential overwrite | Active token silently replaced | Reauthorize creates new transaction; version guards | ACTIVE overwrite rejected without reconnect policy |
| Flag bypass | Disabled route still exchanges | Connect flag on start **and** callback | Flag OFF tests; mid-flight OFF test |
| SSRF | User-controlled provider URL | Fixed `graph.instagram.com`, `api.instagram.com` | No dynamic host from input |
| Provider-error reflection | Raw Meta error to user | `sanitizeProviderErrorMessage`; enum `errorCategory` only | Error redirect tests |
| Long-lived secret exposure | Plaintext verifier/token in state row | Encrypt tokens; hash state; short TTL | Schema/code review |
| Instagram Basic Display confusion | Wrong OAuth product used | Business Login endpoints/scopes only | Provider contract doc cites official URLs |

---

## State atomic-consume requirements

Mirror `SupabaseOAuthTransactionRepository.consumeStateAtCallback`:

```sql
UPDATE oauth_transactions
SET status = 'CALLBACK_RECEIVED', ...
WHERE id = ? AND status = 'PENDING' AND consumed_at IS NULL
```

| Status | Meaning | Callback behavior |
| ------ | ------- | ----------------- |
| `PENDING` | Awaiting provider redirect | Only status eligible for claim |
| `CALLBACK_RECEIVED` | State consumed; exchange in progress or complete | Replay → conflict / safe error |
| `FAILED` / `EXPIRED` | Terminal | No reactivation; new start required |
| `COMPLETED` | Success terminal | Idempotent success only if connection already READY |

**Race scenario:**

```text
Callback A and Callback B use same state simultaneously
→ exactly one UPDATE ... status = 'PENDING' succeeds
→ other receives OAuthTransactionConflictError or safe redirect error
→ authorization code single-use limits double exchange damage
```

**Indexes (existing, verify Instagram reuse):**

- `idx_oauth_transactions_state_hash_active` — unique where `consumed_at IS NULL`
- `idx_oauth_transactions_tenant`, `idx_oauth_transactions_connection`, `idx_oauth_transactions_expires_at`

---

## PKCE decision (pre-implementation)

Per ADR-4 (2026-06-18 Meta Business Login docs): **no `code_challenge` / `code_verifier` documented**.

| If PKCE in PR | Review requirement |
| ------------- | ------------------ |
| Implemented | Link official Meta doc proving support; S256 only; verifier server-side encrypted; never logged |
| Not implemented | PR documents explicit provider constraint; state + app-secret exchange controls sufficient |

**Reject:** undocumented PKCE parameters copied from generic OAuth libraries or Instagram Basic Display guides.

---

## Token/code exposure surfaces (audit checklist)

| Surface | Current Facebook | 2C requirement |
| ------- | ---------------- | -------------- |
| Access logs / reverse proxy | May capture query string on callback | Callback must not log full URL; prefer POST exchange where applicable |
| Route errors | `serverError` on callback catch | Sanitized redirect, not JSON with code |
| Structured logger | Facebook service has no pino in hot path | No spread of `req.query`, provider response |
| `oauth_transactions` | `state_hash`, `encrypted_user_token` | No plaintext state/code/token columns |
| `instagram_oauth_credentials` | 2A ciphertext column | Activate only after successful exchange |
| Callback redirect | Enum `errorCategory` only | No `code`, `state`, `access_token` in Location |
| Browser history | GET callback | Short-lived; no secrets in final redirect |
| Ops dashboard | No OAuth payload preview | Unchanged |
| Test snapshots | `assertFacebookOAuthPublicDtoSafe` | Parallel Instagram assert |

**Forbidden everywhere** (except ephemeral provider request / internal encryption):

```text
authorization code
access token
ciphertext (in public DTOs)
client secret
state plaintext
PKCE verifier
raw provider payload
```

---

## Provider endpoints (official — verify in Agent A PR)

From [`ig-oauth-token-lifecycle.md`](ig-oauth-token-lifecycle.md):

| Step | Method | Host | Notes |
| ---- | ------ | ---- | ----- |
| Authorize | GET redirect | `www.instagram.com` (Business Login) | `client_id`, `redirect_uri`, `scope`, `state`, `response_type=code` |
| Code exchange | POST | `api.instagram.com/oauth/access_token` | Server-side; app secret |
| Long-lived | GET | `graph.instagram.com/access_token` | `grant_type=ig_exchange_token` |
| Refresh (defer 2C) | GET | `graph.instagram.com/refresh_access_token` | Not in 2C scope |

Agent A must cite official Meta doc URLs in implementation report — not blog posts or Basic Display flow.
