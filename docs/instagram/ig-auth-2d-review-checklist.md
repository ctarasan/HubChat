# IG-AUTH-2D — Identity and Test Connection Security Review Checklist

Use when reviewing Agent A IG-AUTH-2D PR. Baseline: master `796affe`. Companion: [`ig-auth-2d-identity-threat-model.md`](ig-auth-2d-identity-threat-model.md).

---

## 1. Scope gate

### Allowed

- Instagram identity provider client (`/me` or equivalent)
- Callback enhancement: identity verify before credential activation
- Test Connection OAuth path (connection-bound)
- Shared identity validation module used by callback + test
- Test feature flag + tests
- Sanitized public DTO extensions for test response
- Implementation report with official Meta doc citations

### Forbidden (BLOCKED if present)

- DM/message send during test or callback
- Worker/adapter/runtime delivery cutover
- Queue binding emission
- Channel Settings OAuth UI (unless explicitly scoped — default forbidden)
- Webhook subscription changes
- Token refresh scheduler
- Legacy credential retirement
- Production env values
- `graph.facebook.com` for OAuth own-identity probe
- ENV / Page token fallback for OAuth test path

---

## 2. Official provider-contract evidence

- [ ] Agent report links official Meta Instagram Login `/me` documentation
- [ ] Host is `graph.instagram.com` (not Facebook Graph for OAuth identity)
- [ ] API version follows project policy (env-driven, not arbitrary hard-code)
- [ ] Field allowlist: `user_id`, `username`, `account_type` (minimum)
- [ ] Token transport matches official endpoint (query or Bearer)
- [ ] No Basic Display or Page-token assumptions
- [ ] No client-supplied `/me` field list

---

## 3. Identity types and storage

- [ ] `provider_instagram_account_id` = canonical professional account ID from `/me`
- [ ] `provider_user_id` semantic documented; compared to `/me` when applicable
- [ ] IGSID never written to credential or test response
- [ ] Username not used as binding key
- [ ] `account_type` used for eligibility only
- [ ] No `profile_picture_url` persistence
- [ ] Facebook Page ID not primary identity for OAuth path

---

## 4. Callback verification checklist

Required order:

```text
exchange → long-lived → /me identity → validate → ID compare → activate
```

- [ ] Credential not ACTIVE before identity passes
- [ ] Exchange `user_id` compared to `/me user_id` when both available
- [ ] Mismatch fails closed; no orphan ACTIVE credential
- [ ] Identity failure finalizes OAuth state FAILED
- [ ] No ENV/token fallback on identity failure
- [ ] No raw provider JSON persisted
- [ ] Audit events sanitized

### Reauthorization / account switch

- [ ] Reauth: same `provider_instagram_account_id` required
- [ ] Username change allowed (metadata only)
- [ ] Professional account ID change rejected
- [ ] Version/status guards on activate/replace
- [ ] No connection rebind to different `channel_connection_id`

---

## 5. Test Connection trust boundary

Required inputs:

- [ ] Authenticated active user (ADMIN per existing route policy)
- [ ] `tenantId` from auth context
- [ ] Explicit `channelConnectionId` (body or derived from connection-scoped API)
- [ ] `authFamily` = `INSTAGRAM_BUSINESS_LOGIN`
- [ ] `deliveryPath` = `DATABASE_ONLY`
- [ ] Connection-bound credential resolver (2B) — not duplicate weak resolver

Forbidden:

- [ ] Provider account lookup without tenant+connection
- [ ] Tenant-global active Instagram credential
- [ ] First available connection
- [ ] ENV / legacy Page token fallback
- [ ] Automatic connection switch

### Same-resolver principle

- [ ] Test uses same repository/decryption/identity policy as future runtime resolver
- [ ] Test does not require `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED`
- [ ] Legacy `POST /api/channel-settings/instagram/test-connection` unchanged when OAuth test flag OFF

---

## 6. Side-effect absence

- [ ] No message send
- [ ] No conversation create
- [ ] No webhook subscribe
- [ ] No token refresh call
- [ ] No credential activate/rotate from test
- [ ] No queue job
- [ ] No worker/adapter import from test route
- [ ] No auto-update of canonical account ID from test (unless explicit policy documented)

---

## 7. Public DTO and exposure

- [ ] Response has no accessToken, ciphertext, credentialId, credentialVersion
- [ ] No full professional account ID (masked if shown)
- [ ] No IGSID, client secret, raw provider error
- [ ] No profile_picture_url in response
- [ ] `assert*` or forbidden-pattern test on test response JSON
- [ ] Logs do not spread provider response or token

---

## 8. Status / error mapping

| Condition | Expected |
| --------- | -------- |
| Valid identity | READY or limited verified status |
| Expired/revoked | REAUTH_REQUIRED |
| Missing credential | CONFIGURATION_ERROR |
| Missing permission | CONFIGURATION_ERROR |
| Non-professional account | CONFIGURATION_ERROR |
| ID mismatch | CONFIGURATION_ERROR |
| Rate limit / 5xx | Retryable or provider unavailable |
| Flag OFF | Disabled response |

- [ ] No raw Meta error text to client

---

## 9. Permission / readiness wording

- [ ] Docs/tests do not claim DM delivery from `/me` success
- [ ] `READY` documented as identity readiness if used
- [ ] Capability probes deferred or explicitly limited

---

## 10. Feature flags

Expected: `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` (or PR-documented equivalent).

- [ ] Absent = OFF
- [ ] Blank / false = OFF
- [ ] Test flag does not enable connect or runtime
- [ ] `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` unchanged OFF
- [ ] No production env value in PR

---

## 11. Runtime no-change checklist

- [ ] `src/worker/main.ts` — no new Instagram test/runtime wiring
- [ ] No queue producer changes
- [ ] No adapter cutover
- [ ] Legacy test path behavior unchanged when flags OFF
- [ ] No Channel Settings UI OAuth exposure (default)

---

## 12. Test matrix (Agent A PR)

### Identity

- [ ] Business account accepted
- [ ] Creator account accepted (if supported)
- [ ] Personal / unsupported rejected
- [ ] Missing ID rejected
- [ ] Malformed account_type rejected
- [ ] Username changed on reauth (allowed)
- [ ] Professional ID changed on reauth (rejected)
- [ ] Exchange vs `/me` ID mismatch rejected

### Callback

- [ ] Identity before activation
- [ ] Identity failure leaves no ACTIVE credential
- [ ] Same-account reauth
- [ ] Account-switch rejected
- [ ] No profile URL persisted

### Test Connection

- [ ] ADMIN pass; MANAGER/SALES deny (if route policy unchanged)
- [ ] Wrong tenant rejected
- [ ] Wrong connection rejected
- [ ] OAuth binding exact
- [ ] No fallback
- [ ] Flag OFF
- [ ] Expired token → REAUTH_REQUIRED
- [ ] ID mismatch
- [ ] Rate limit / provider unavailable
- [ ] No message/queue/runtime mutation

### Regression

- [ ] Legacy Instagram test unchanged when flag OFF
- [ ] Worker/adapter unchanged
- [ ] Public DTO safe
- [ ] Full suite pass

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
| **PASS** | Identity before activate; account-switch blocked; test connection-bound; no fallback/side effects; flags OFF; no delivery cutover |
| **PASS WITH NOTES** | Minor test/doc gaps only |
| **CHANGES REQUESTED** | Identity after activate; ID confusion; fallback; side effects; leak |
| **BLOCKED** | Production cutover; wrong provider endpoint; scope violation |
