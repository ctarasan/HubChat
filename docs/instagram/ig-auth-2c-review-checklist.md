# IG-AUTH-2C — OAuth Security Review Checklist

Use when reviewing Agent A IG-AUTH-2C PR. Baseline: master `ea94515`. Companion: [`ig-auth-2c-threat-model.md`](ig-auth-2c-threat-model.md).

---

## 1. Scope gate

### Allowed

- Instagram OAuth start/callback routes (and minimal session/status if in 2C scope)
- `oauth_transactions` INSTAGRAM provider extension
- Instagram OAuth service + Meta provider client
- State security helpers (reuse or parallel Facebook)
- Credential activation via `instagram_oauth_credentials` repository
- Connect feature flag + tests
- Implementation report with official Meta doc citations

### Forbidden (BLOCKED if present)

- Worker/adapter/runtime cutover
- Queue producer emitting OAuth binding
- Channel Settings UI changes (unless explicitly scoped — default forbidden)
- Test Connection changes
- Refresh scheduler / cron job
- Legacy token retirement
- Production env value additions
- Deployment / migration execution in prod
- Meta delivery API calls from outbound adapter

---

## 2. State-security checklist

- [ ] CSPRNG-generated (≥32 bytes entropy)
- [ ] URL-safe encoding (base64url)
- [ ] Opaque to client (only authorize URL returned)
- [ ] DB stores `state_hash` (SHA-256), never plaintext state
- [ ] TTL ≤ 15 minutes (match Facebook or justify)
- [ ] Bound to `tenant_id`
- [ ] Bound to `connection_id` (`channel_connection_id`)
- [ ] Bound to provider `INSTAGRAM`
- [ ] Bound to initiating actor (`initiated_by_auth_user_id`, `initiated_by_sales_agent_id`)
- [ ] Return destination fixed (Channel Settings instagram tab)
- [ ] Single-use via atomic claim
- [ ] No reactivation after `FAILED` / `EXPIRED`
- [ ] No raw state in logs, audit, or redirect URL
- [ ] Parallel callback race test: exactly one claim succeeds
- [ ] Expired state rejected before exchange
- [ ] Unique partial index on `state_hash` where active

---

## 3. Role and tenant authorization

### Start route

- [ ] `requireAuth(req, ["ADMIN"])`
- [ ] Tenant from `x-tenant-id` auth context only — not request body
- [ ] `channelConnectionId` validated: exists, owned by tenant, provider INSTAGRAM
- [ ] No user-supplied tenant as authority
- [ ] MANAGER/SALES receive 403
- [ ] Connect flag OFF → no state created (fail closed)

### Callback route

- [ ] Unauthenticated (no Bearer required)
- [ ] State record is **sole** tenant/connection binding
- [ ] Callback query cannot override `tenant_id` or `connection_id`
- [ ] Browser session mismatch cannot rebind transaction
- [ ] Logged-out callback still safe (no credential leak)
- [ ] Missing/invalid state rejected **before** code exchange
- [ ] Connect flag OFF → no exchange even if state exists

### Flag-toggle race

```text
state created while ON → flag OFF before callback → callback must not exchange
```

- [ ] Tested

---

## 4. Redirect / open-redirect review

### Allowed

- [ ] Fixed internal path: `/dashboard/channel-settings?channel=instagram&oauth=…`
- [ ] Enum `errorCategory` query param only
- [ ] Origin from `resolveFacebookOAuthAppBaseUrl` equivalent (trusted config)

### Forbidden

- [ ] Arbitrary URL / `returnTo` from client
- [ ] Request `Host` header as redirect base
- [ ] `Referer`-derived redirect
- [ ] `javascript:` / `data:` schemes
- [ ] Protocol-relative `//evil.com`
- [ ] Double-encoded redirect
- [ ] Nested return URL param
- [ ] Provider error description in query

### Final redirect must not contain

```text
code
state
access_token / token
tenantId
channelConnectionId
credentialId
providerUserId
raw provider error text
```

- [ ] Unsafe redirect guard (regex on Location) like Facebook callback
- [ ] `Cache-Control: no-store` on callback response (recommended — Facebook lacks this)

---

## 5. Provider-contract review

Agent A PR must include official Meta doc evidence for:

- [ ] Authorize endpoint URL and query parameters
- [ ] Token exchange endpoint (`api.instagram.com/oauth/access_token`)
- [ ] Long-lived exchange (`graph.instagram.com`, `grant_type=ig_exchange_token`)
- [ ] Redirect URI exact-match rules
- [ ] Scope list (minimum necessary — e.g. `instagram_business_basic`, messaging scopes per ADR)
- [ ] Professional account requirements
- [ ] Token expiry (1h short-lived, 60d long-lived)
- [ ] PKCE support or documented absence

### Reject

- [ ] Hard-coded values from blogs or Instagram Basic Display
- [ ] Arbitrary endpoint hosts
- [ ] Undocumented query parameters
- [ ] Automatic retry on code exchange failure
- [ ] Persisting raw provider JSON response

### Client implementation

- [ ] Fixed HTTPS hosts only (SSRF-safe)
- [ ] Strict response schema validation
- [ ] Request timeout and body size limits
- [ ] `sanitizeProviderErrorMessage` on failures
- [ ] No `client_secret` in logs or redirects

---

## 6. PKCE review

| Outcome | Checklist |
| ------- | --------- |
| **Implemented** | Official Meta doc link; S256 only; verifier server-side; encrypted if stored; challenge correct; single-use; never logged |
| **Not implemented** | PR documents Meta does not document PKCE for Business Login; state + server-secret controls cited; no stray `code_challenge` params |

---

## 7. Token/code secrecy

Audit all surfaces — no forbidden material:

```text
authorization code
access token
ciphertext (in public responses)
client secret
state plaintext
PKCE verifier
raw provider payload
```

- [ ] Logger does not spread `request.query`, `request.url`, provider response, token result
- [ ] Route errors do not echo code/state
- [ ] Public DTO assert (parallel `assertFacebookOAuthPublicDtoSafe`)
- [ ] Test snapshots scanned
- [ ] Audit rows contain categories only

---

## 8. Credential activation review

- [ ] Token exchange succeeds **before** `activate()` / credential create
- [ ] Exchange failure leaves no orphan ACTIVE credential
- [ ] Token encrypted via canonical `encryptChannelCredentialPlaintext`
- [ ] Exact `tenantId` + `channelConnectionId` binding
- [ ] No tenant-global connection lookup
- [ ] No ENV fallback for OAuth credential
- [ ] REAUTH_REQUIRED path: explicit reauthorize, not silent overwrite
- [ ] ACTIVE credential not overwritten without reconnect policy
- [ ] Version/status guards from IG-AUTH-2A respected
- [ ] `tokenExpiresAt` from provider `expires_in` + injected clock
- [ ] Raw provider response not persisted
- [ ] Callback success = credential captured, **not** runtime cutover

---

## 9. Feature-flag review

Expected connect flag: `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` (or PR-documented equivalent).

- [ ] Absent = OFF
- [ ] Blank = OFF
- [ ] `"false"` = OFF
- [ ] Unsupported values = OFF
- [ ] Start blocked when OFF
- [ ] Callback blocked when OFF (no exchange)
- [ ] No production env value added in PR
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` remains OFF
- [ ] No worker/adapter selection wired

---

## 10. Error-handling review

Provider cases to test:

| Case | Expected public outcome |
| ---- | ----------------------- |
| Consent denied | `ACCESS_DENIED` category redirect |
| Invalid request | `INVALID_CALLBACK` or safe enum |
| Invalid/reused/expired code | `TOKEN_EXCHANGE_FAILED` — no code in message |
| Provider 4xx/5xx | Sanitized category; `PROVIDER_TEMPORARY` if retryable |
| Timeout | Safe error; no partial credential |
| Invalid JSON | Fail closed |
| Missing token in response | `TOKEN_EXCHANGE_FAILED` |
| Unexpected shape | Fail closed |

Public response: sanitized `errorCategory` + restart guidance only.

**Must not expose:** provider description, client ID/secret, code, state, raw HTTP body, stack trace, DB constraint names.

---

## 11. Runtime no-change checklist (post-merge)

After IG-AUTH-2C merge, verify still true:

- [ ] Legacy Instagram outbound path unchanged
- [ ] No OAuth queue job emitted
- [ ] Worker does not call Instagram OAuth resolver (production path)
- [ ] Adapter does not use OAuth credential
- [ ] Test Connection unchanged
- [ ] Channel Settings UI unchanged (unless explicit 2C UI scope — default no)
- [ ] Webhooks unchanged
- [ ] No refresh scheduler
- [ ] No legacy token retirement
- [ ] Feature flags default OFF in production
- [ ] No production migration execution

**Blocker:** any import wiring worker/adapter/sendOutbound to Instagram OAuth resolver or queue binding producer.

---

## 12. Test quality matrix

### OAuth flow

- [ ] Start ADMIN-only
- [ ] Start rejects SALES/MANAGER
- [ ] Start validates connection ownership
- [ ] State entropy / hash-at-rest
- [ ] Callback happy path
- [ ] Callback denied consent
- [ ] Callback missing code/state
- [ ] Callback invalid state
- [ ] Callback replay / parallel race
- [ ] Flag OFF start and callback
- [ ] Flag toggled OFF between start and callback

### Exchange + credential

- [ ] Short-lived + long-lived exchange (mocked provider)
- [ ] Encrypt before persist
- [ ] Activate binding tenant+connection
- [ ] No silent ACTIVE overwrite
- [ ] Reauthorize path (if in scope)

### Secrecy

- [ ] Public DTO assert passes
- [ ] Redirect Location has no secrets
- [ ] Errors have no code/token

### Wiring guard

- [ ] `worker/main.ts` unchanged / no Instagram OAuth resolver import
- [ ] No queue binding emission in send path

---

## 13. Independent PR review workflow

1. Separate worktree on Agent A branch
2. Scope gate (§1)
3. Walk §2–§12
4. Secret scan, hidden/bidi scan, full suite/build
5. Post GitHub comment with verdict
6. **Do not merge**

### Verdict criteria

| Verdict | When |
| ------- | ---- |
| **PASS** | All security controls satisfied; no production cutover |
| **PASS WITH NOTES** | Minor docs/test gaps only |
| **CHANGES REQUESTED** | State/redirect/role/leakage/fixable contract issues |
| **BLOCKED** | Production cutover, raw credential in diff, scope violation, missing provider evidence |
