# Agent Report — FB-OAUTH-1B Facebook OAuth Backend Foundation

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-15 |
| Phase | FB-OAUTH-1B — OAuth backend foundation (implementation) |
| Branch | `feature/fb-oauth-1b-backend-foundation` |
| Contracts | [FB-OAUTH-1A](../agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md), [FB-OAUTH-1D UI](../agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md) |

---

## Summary

Delivers the Facebook OAuth backend foundation through page selection and token persistence:

- Callback success → `AWAITING_PAGE_SELECTION`
- `POST /complete` success → `AUTHORIZING` / `COMPLETED` / `UNKNOWN` / `CONNECTING`
- Page token encrypted in `channel_credentials` only (no `channel_settings` dual-write)
- `POST /health` and `POST /reconnect` return stable **501** deferred responses (no misleading `READY` / `CONNECTED`)

**Deferred:** runtime resolver activation, operational readiness (`READY`), reconnect execution, inbound Graph resolver.

---

## Architecture

| Layer | Path |
|---|---|
| Migration | `supabase/migrations/20260614120000_fb_oauth_1b_oauth_transactions.sql` |
| Domain | `src/domain/oauthTransactions.ts`, `src/domain/facebookOAuth.ts` |
| Security helpers | `src/lib/facebookOAuthSecurity.ts`, `src/lib/facebookOAuthCookie.ts` |
| Config | `src/lib/facebookOAuthConfig.ts` (`HUBCHAT_FACEBOOK_OAUTH_ENABLED`, `META_APP_ID`, secrets) |
| Display state | `src/lib/facebookOAuthDisplayState.ts` |
| Graph adapter | `src/infrastructure/adapters/meta/facebookGraphOAuth.ts` |
| OAuth repository | `src/infrastructure/adapters/repositories/supabaseOAuthTransactionRepository.ts` |
| Service | `src/application/facebookOAuth/facebookOAuthService.ts` |
| API routes | `app/api/channel-connect/facebook/**` |

Connection metadata updates use new `ChannelConnectionRepository.updateProviderMetadata`.

---

## Migration

**Table:** `oauth_transactions`

- `state_hash` (SHA-256, single-use at callback)
- `resume_session_hash` (SHA-256 of HttpOnly cookie value)
- `status` enum: `PENDING` → `CALLBACK_RECEIVED` → `PAGES_READY` → `COMPLETED` / `FAILED` / `EXPIRED`
- Encrypted interim user token (`encrypted_user_token`)
- `page_candidates_json`, `selected_page_id`, `error_category`
- 15-minute `expires_at` TTL
- Tenant + initiating ADMIN (`initiated_by_auth_user_id`, `initiated_by_sales_agent_id`) binding

---

## Endpoints

| Method | Path | Status |
|---|---|---|
| `GET` | `/api/channel-connect/facebook/status` | Implemented |
| `POST` | `/api/channel-connect/facebook/oauth/start` | Implemented |
| `GET` | `/api/channel-connect/facebook/oauth/callback` | Implemented (no JWT; state-bound) |
| `GET` | `/api/channel-connect/facebook/oauth/session` | Implemented |
| `GET` | `/api/channel-connect/facebook/pages` | Implemented |
| `POST` | `/api/channel-connect/facebook/complete` | Implemented |
| `POST` | `/api/channel-connect/facebook/health` | **Deferred** — 501 token-free `CONNECTING` |
| `POST` | `/api/channel-connect/facebook/reconnect` | **Deferred** — 501 token-free |

All operator routes: `requireAuth(req, ["ADMIN"])`, tenant from `auth.tenantId`.

---

## Security controls

- Cryptographically random OAuth `state`; stored as SHA-256; consumed at callback
- Authorization code exchanged server-side only
- HttpOnly / Secure / SameSite=Lax resume cookie (`Path=/api/channel-connect/facebook`, `Max-Age=900`)
- UI resumes via `GET /oauth/session` only — no cookie name in API DTOs
- Redirect URLs never include `code`, `state`, tokens, or transaction IDs
- Provider errors sanitized; stable `errorCategory` (UPPER_SNAKE_CASE)
- Cross-tenant / wrong-user session access returns safe not-found responses
- Public DTO safety guard: `assertFacebookOAuthPublicDtoSafe`

---

## Configuration

| Variable | Purpose |
|---|---|
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | Feature gate |
| `META_APP_ID` / `FACEBOOK_APP_ID` | Meta app id |
| `FACEBOOK_APP_SECRET` / `META_APP_SECRET` | Meta app secret |
| `META_GRAPH_VERSION` / `FACEBOOK_GRAPH_VERSION` | Graph version (default `v25.0`) |
| `NEXT_PUBLIC_APP_BASE_URL` | Canonical callback base |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Encrypt user + page tokens |

API exposes only `oauthAvailable: boolean`.

---

## Tests

| File | Coverage |
|---|---|
| `src/lib/facebookOAuthSecurity.test.ts` | State/resume generation, expiry |
| `src/lib/facebookOAuthCookie.test.ts` | HttpOnly cookie properties |
| `src/lib/facebookOAuthConfig.test.ts` | `oauthAvailable` gating |
| `src/lib/facebookOAuthDisplayState.test.ts` | Lifecycle display derivation |
| `src/interfaces/api/facebookOAuthRoutes.test.ts` | ADMIN gate, callback redirect, complete CONNECTING, deferred health |

---

## Deferred (next backend PR)

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` runtime activation
- `POST /health` five-check readiness gate → `READY` / UI `CONNECTED`
- `POST /reconnect` execution
- FB-OAUTH-1C inbound Graph token resolver

---

## Verification

```bash
npm test
npx tsc -p tsconfig.json --noEmit
```

**Confirmation:** `POST /complete` returns `connectionStatus: AUTHORIZING` and `displayState: CONNECTING` only — never `READY` or `CONNECTED`.
