# IG-AUTH-2C — OAuth Security Review Checklist

Companion: [`ig-auth-2c-threat-model.md`](ig-auth-2c-threat-model.md). Baseline: master `e480f07` (PR #245 merged).

---

## Verified in PR #245 (merged master)

Independent review: **PASS** — https://github.com/ctarasan/HubChat/pull/245#issuecomment-4739840647

### State security

- [x] CSPRNG 32-byte base64url (`instagramOAuthSecurity.ts`)
- [x] SHA-256 `state_hash` at rest — no plaintext state column
- [x] 10-minute TTL (`INSTAGRAM_OAUTH_STATE_TTL_MS`)
- [x] Tenant + `channel_connection_id` composite FK
- [x] Provider INSTAGRAM constraint
- [x] Actor binding (`initiated_by_auth_user_id`, `initiated_by_sales_agent_id`)
- [x] `return_destination` enum (`CHANNEL_SETTINGS` only)
- [x] Atomic claim before exchange (`claimStateAtCallback`)
- [x] Finalize `CONSUMED`/`FAILED` — no PENDING reactivation
- [x] Unique index on `state_hash`
- [x] Parallel claim test (`supabaseInstagramOAuthStateRepository.test.ts`)
- [x] Expired state rejected at claim

### Role and tenant authorization

- [x] `requireAuth(req, ["ADMIN"])` on start
- [x] MANAGER/SALES rejected (`instagramOAuthRoutes.test.ts`)
- [x] Tenant from auth context only
- [x] `channelConnectionId` ownership validated
- [x] Connect flag OFF → no state on start
- [x] Callback unauthenticated; state record is binding authority
- [x] Connect flag OFF after claim → no exchange (service test)

### Authorization URL

- [x] Fixed `https://www.instagram.com/oauth/authorize`
- [x] Server `client_id`, exact `redirect_uri`, server scopes
- [x] Opaque server-generated state in URL only
- [x] No App Secret in authorize URL
- [x] Start response `Cache-Control: no-store`

### Callback validation

- [x] State required on all paths
- [x] Denial path skips token exchange
- [x] Missing code fails closed
- [x] Max parameter length 2048
- [x] Safe redirect (`assertInstagramOAuthRedirectUrlSafe`)
- [x] 303 redirect to Channel Settings

### Provider client

- [x] `POST api.instagram.com/oauth/access_token` form-urlencoded
- [x] `GET graph.instagram.com` `ig_exchange_token`
- [x] Timeout + response size bounds
- [x] Strict JSON parse; sanitized errors
- [x] No automatic code-exchange retry
- [x] PKCE not implemented — documented absence

### Credential persistence

- [x] Exchange before `activate`
- [x] Canonical encryption via IG-AUTH-2A repository
- [x] Exact tenant+connection binding
- [x] ACTIVE/TOKEN_EXPIRING/REFRESHING not silently overwritten
- [x] REAUTH_REQUIRED/PENDING activate in place (code path)
- [x] No ENV fallback

### Secrecy

- [x] `assertInstagramOAuthStartResponseSafe`
- [x] Audit forbidden metadata keys
- [x] No code/token in redirect query
- [x] No raw provider response persistence

### Feature flags

- [x] `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` — absent/blank/false = OFF
- [x] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` unchanged OFF
- [x] No production env value added in PR

### Runtime no-change

- [x] No worker Instagram OAuth connect import (`src/worker/main.ts` regression test)
- [x] No queue binding emission
- [x] No Test Connection changes
- [x] No Channel Settings UI changes
- [x] No webhook changes
- [x] No refresh scheduler

### Test evidence

- [x] Full suite 2,145 pass (Agent A + Agent B verification)
- [x] State, route, service, provider targeted tests

---

## Required before production enablement

**Operational — not code-complete in IG-AUTH-2C**

- [ ] Migration `20260620120000_ig_auth_2c_instagram_oauth_states.sql` executed in target DB
- [ ] Meta app configured with exact production callback URL
- [ ] Production App ID / App Secret in secure env (not repo)
- [ ] Meta App Review permissions approved
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED=true` only in controlled rollout
- [ ] Staging/production connect smoke with real Meta account
- [ ] Operator connect/reconnect/disconnect runbook
- [ ] Log and secret-leak monitoring on first enablement
- [ ] Rollback procedure (flag OFF + operator guidance)

**Not claimed:** production ready, OAuth live, migration complete in production, runtime enabled.

---

## Deferred phases

| Phase | Scope |
| ----- | ----- |
| IG-AUTH-2D | Identity verification, Test Connection parity |
| IG-AUTH-2E | DM adapter cutover |
| IG-AUTH-2F | Private reply |
| IG-AUTH-2G | Source Post/profile parity |
| IG-AUTH-2H | Refresh/reauth scheduler |
| IG-AUTH-2I | Rollout and legacy retirement |

---

## Non-blocking follow-ups (post-merge)

| Item | Status |
| ---- | ------ |
| Explicit REAUTH_REQUIRED reauthorize test | Test gap — code path exists |
| Code+error ambiguity service test | Test gap — code path exists |
| Callback redirect `Cache-Control: no-store` | Start has no-store; callback redirect does not |

---

## Pre-merge review workflow (completed)

PR #245 reviewed at `0cf6c69`. Verdict **PASS**. Do not re-run unless implementation changes.

---

## Documentation PR #244

This checklist updated post-merge for maintainer merge of security review documentation only.
