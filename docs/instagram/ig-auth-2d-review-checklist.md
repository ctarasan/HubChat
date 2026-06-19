# IG-AUTH-2D — Identity and Test Connection Security Review Checklist

Finalized after PR #247 merge. Baseline: master `91ae0ef`. Companion: [`ig-auth-2d-identity-threat-model.md`](ig-auth-2d-identity-threat-model.md).

---

## 1. Scope gate

### Allowed (merged)

- Instagram identity provider client (`/me`)
- Callback enhancement: identity verify before credential activation
- Test Connection OAuth path (connection-bound)
- Shared identity validation module used by callback + test
- Test feature flag + tests
- Sanitized public DTO extensions for test response
- Implementation report with official Meta doc citations

### Forbidden — verified absent

- [x] DM/message send during test or callback
- [x] Worker/adapter/runtime delivery cutover
- [x] Queue binding emission
- [x] Channel Settings OAuth UI
- [x] Webhook subscription changes
- [x] Token refresh scheduler
- [x] Legacy credential retirement
- [x] Production env values
- [x] `graph.facebook.com` for OAuth own-identity probe
- [x] ENV / Page token fallback for OAuth test path

---

## 2. Official provider-contract evidence

- [x] Agent report links official Meta Instagram Login `/me` documentation
- [x] Host is `graph.instagram.com` (not Facebook Graph for OAuth identity)
- [x] API version follows project policy (env-driven)
- [x] Field allowlist: `user_id`, `username`, `account_type`
- [x] Token transport: Bearer header
- [x] No Basic Display or Page-token assumptions for OAuth identity
- [x] No client-supplied `/me` field list

---

## 3. Identity types and storage

- [x] `provider_instagram_account_id` = canonical professional account ID from `/me`
- [x] `provider_user_id` semantic documented; compared to `/me`
- [x] IGSID never written to credential or test response
- [x] Username not used as binding key
- [x] `account_type` used for eligibility only
- [x] No `profile_picture_url` persistence
- [x] Facebook Page ID not primary identity for OAuth path
- [x] Additive columns: `verified_username`, `verified_account_type`, `identity_verified_at`

---

## 4. Callback verification checklist

Required order (verified):

```text
claim → exchange → long-lived → /me identity → validate → ID compare → activate
```

- [x] Credential not ACTIVE before identity passes
- [x] Exchange `user_id` compared to `/me user_id`
- [x] Blank/null/whitespace token-response ID fails closed
- [x] Mismatch fails closed; no orphan ACTIVE credential
- [x] Identity failure finalizes OAuth state FAILED
- [x] No ENV/token fallback on identity failure
- [x] No raw provider JSON persisted
- [x] Audit events sanitized

### Reauthorization / account switch (verified)

- [x] Reauth: same `provider_instagram_account_id` required
- [x] Username change allowed (metadata only)
- [x] Professional account ID change rejected (`INSTAGRAM_OAUTH_ACCOUNT_SWITCH_REJECTED`)
- [x] Version/status guards on activate/replace
- [x] No connection rebind to different `channel_connection_id`

---

## 5. Test Connection trust boundary

Required inputs (verified):

- [x] Authenticated active user (ADMIN per existing route policy)
- [x] `tenantId` from auth context
- [x] Connection-bound via OAuth-managed detection + resolver
- [x] `authFamily` = `INSTAGRAM_BUSINESS_LOGIN`
- [x] `deliveryPath` = `DATABASE_ONLY`
- [x] Connection-bound credential resolver (2B)

Forbidden (verified absent):

- [x] Provider account lookup without tenant+connection
- [x] Tenant-global active Instagram credential
- [x] First available connection
- [x] ENV / legacy Page token fallback on OAuth path
- [x] Automatic connection switch

### Routing (verified — amendment)

- [x] `NOT_OAUTH_MANAGED` → legacy path continues
- [x] `OAUTH_TEST_DISABLED` → explicit DISABLED; no legacy fallthrough
- [x] `OAUTH_TEST_RESULT` → OAuth result returned; no legacy fallthrough
- [x] Ambiguous legacy + OAuth config → fail closed without provider probe

### Same-resolver principle

- [x] Test uses same repository/decryption/identity policy as runtime resolver
- [x] Test does not require `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED`
- [x] Legacy test path unchanged for non-OAuth connections when OAuth test flag OFF

---

## 6. Side-effect absence

- [x] No message send
- [x] No conversation create
- [x] No webhook subscribe
- [x] No token refresh call
- [x] No credential activate/rotate from test
- [x] No queue job
- [x] No worker/adapter import from test route
- [x] No legacy health update on OAuth test path

---

## 7. Public DTO and exposure

- [x] Response has no accessToken, ciphertext, credentialId, credentialVersion
- [x] No full professional account ID (masked if shown)
- [x] No IGSID, client secret, raw provider error
- [x] No profile_picture_url in response
- [x] Forbidden-pattern test on test response JSON
- [x] Logs do not spread provider response or token

---

## 8. Status / error mapping

| Condition | Expected | Verified |
| --------- | -------- | -------- |
| Valid identity | READY (identity only) | Yes |
| Expired/revoked | REAUTH_REQUIRED | Yes |
| Missing credential | NOT_CONFIGURED | Yes |
| Missing permission | Configuration error | Yes |
| Non-professional account | Configuration error | Yes |
| ID mismatch | Configuration error | Yes |
| Rate limit / 5xx | Retryable or provider unavailable | Yes |
| Flag OFF (OAuth-managed) | DISABLED | Yes |
| Ambiguous config | Configuration error | Yes |

- [x] No raw Meta error text to client

---

## 9. Permission / readiness wording

- [x] Docs/tests do not claim DM delivery from `/me` success
- [x] `READY` documented as identity readiness
- [x] Test message states messaging validated separately

---

## 10. Feature flags

- [x] `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` — absent = OFF
- [x] Blank / false / off = OFF
- [x] Test flag does not enable connect or runtime
- [x] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` unchanged OFF
- [x] No production env value in PR

---

## 11. Runtime no-change checklist

- [x] `src/worker/main.ts` — no new Instagram test/runtime wiring
- [x] No queue producer changes
- [x] No adapter cutover
- [x] Legacy test path behavior unchanged for non-OAuth connections
- [x] No Channel Settings UI OAuth exposure

---

## 12. Test matrix (verified in PR #247)

### Identity

- [x] Business account accepted
- [x] Creator account accepted (MEDIA_CREATOR mapped)
- [x] Personal / unsupported rejected
- [x] Missing ID rejected
- [x] Malformed account_type rejected
- [x] Exchange vs `/me` ID mismatch rejected
- [x] Blank/null/whitespace token-response ID rejected

### Callback

- [x] Identity before activation (call-order test)
- [x] Identity failure leaves no ACTIVE credential
- [x] Same-account reauth
- [x] Account-switch rejected
- [x] No profile URL persisted

### Test Connection

- [x] ADMIN pass (existing route policy)
- [x] OAuth binding exact
- [x] No fallback on OAuth path
- [x] Flag OFF → DISABLED (absent, blank, false, off)
- [x] Expired token → REAUTH_REQUIRED
- [x] ID mismatch
- [x] Ambiguous config fail closed
- [x] No message/queue/runtime mutation

### Regression

- [x] Legacy Instagram test unchanged for non-OAuth connections
- [x] Worker/adapter unchanged
- [x] Public DTO safe
- [x] Full suite pass (2,172)

---

## 13. Final implementation review evidence

| Field | Value |
|-------|-------|
| Implementation PR | #247 |
| Merged status | merged |
| Merged master SHA | `91ae0ef` |
| Pre-merge reviewed SHA | `4dd8759` |
| Final reviewed SHA | `5735340` |
| Initial review | PASS WITH NOTES |
| Delta review | PASS |
| Test evidence | 2,172/2,172 passed |
| Typecheck / Lint / Build | PASS |
| git diff --check | PASS |
| Hidden/bidi scan | PASS |
| Secret scan | PASS |

Review comments:

- Initial: https://github.com/ctarasan/HubChat/pull/247#issuecomment-4741231861
- Delta: https://github.com/ctarasan/HubChat/pull/247#issuecomment-4741315263

---

## 14. Production enablement boundary

PR #247 merge does **not** enable production Instagram OAuth identity testing or delivery.

Still OFF / not performed:

- `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` production flag-on
- Channel Settings OAuth UI
- OAuth delivery/runtime cutover
- OAuth queue emission
- Production migration execution
- Deployment/live Meta smoke
- Legacy credential retirement

---

## 15. Remaining deferred work

| Phase | Scope |
|-------|-------|
| IG-AUTH-2E | DM adapter cutover |
| IG-AUTH-2F | Private reply |
| IG-AUTH-2G | Source Post/profile parity |
| IG-AUTH-2H | Refresh/reauth scheduler |
| IG-AUTH-2I | Rollout and legacy retirement |
| Channel Settings OAuth UI | Operator connect UX |

---

## Verdict (final)

| Verdict | Result |
| ------- | ------ |
| **PASS** | Identity before activate; account-switch blocked; test connection-bound; no fallback/side effects; flags OFF; no delivery cutover — **confirmed at `5735340`** |

Documentation PR #246 ready for maintainer merge.
