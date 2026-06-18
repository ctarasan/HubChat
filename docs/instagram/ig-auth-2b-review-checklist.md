# IG-AUTH-2B — Security Review Checklist

Use when reviewing Agent A IG-AUTH-2B PR. Baseline: master `6a709fb`. Companion: [`ig-auth-2b-queue-exposure-matrix.md`](ig-auth-2b-queue-exposure-matrix.md).

---

## 1. Queue contract

### Allowed fields

```text
provider
authFamily
deliveryPath
channelConnectionId
contractVersion
message/job identifiers per existing OutboundMessageRequestedPayload
```

### Forbidden fields

```text
accessToken
ciphertext
authorizationCode
appSecret
verifyToken
secretFingerprint
rawProviderResponse
encryptionKey
Authorization header
decryptedSecret
instagram_oauth_credentials row blobs
```

### credentialId / credentialVersion

- [ ] Not present in queue **or** documented as non-authoritative only
- [ ] Worker resolves by `tenantId` + `channelConnectionId` at execution — not queue snapshot
- [ ] Stale version in queue does not block resolution of newer active credential

### Binding principle

```text
Queue binds connection.
Worker resolves current credential.
```

---

## 2. Resolver trust-boundary checklist

### Required input

- [ ] `tenantId`
- [ ] `channelConnectionId`
- [ ] Expected provider (e.g. `INSTAGRAM`)
- [ ] Expected auth family
- [ ] Expected delivery path

### Required behavior

- [ ] Filter by tenant **and** connection (composite scope)
- [ ] No provider-account-only lookup
- [ ] No tenant-global fallback
- [ ] No connection switch (job binding is authoritative)
- [ ] No ENV fallback for OAuth (`blockLegacyFallback` or equivalent)
- [ ] Decrypt only after scope + lifecycle validation
- [ ] Return secret only to internal caller (adapter), never in diagnostics
- [ ] Never log resolved credential object
- [ ] Classify lifecycle: ACTIVE, REAUTH_REQUIRED, REFRESHING, DISCONNECTED, missing
- [ ] Use injected clock (testable refresh/expiry)
- [ ] Sanitize DB/decryption errors (no ciphertext, no cross-tenant existence detail)

### Reference pattern (Facebook)

`channelConnectRuntimeResolver.ts` — `blockLegacyFallback`, `channelConnectRuntimeDiagnostics.ts` — `TOKEN_LIKE` guard.

---

## 3. No-fallback test matrix

Agent A PR must include tests covering (or equivalent):

| Requested auth | Delivery path | DB credential result | Expected |
| -------------- | ------------- | -------------------- | -------- |
| OAuth | DB_ONLY | ACTIVE | resolve |
| OAuth | DB_ONLY | missing | config error |
| OAuth | DB_ONLY | REAUTH_REQUIRED | reauth |
| OAuth | DB_ONLY | REFRESHING | retryable |
| OAuth | ENV fallback | any | **reject** |
| OAuth | DB_ONLY | wrong tenant | not found |
| OAuth | DB_ONLY | other connection active | reject (no switch) |
| Legacy | legacy path | current config | unchanged |

**Hard rule:** No test or code path where OAuth failure uses `INSTAGRAM_ACCESS_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN`, or `loadEnvInstagramCredentials`.

Review checks:

- [ ] Each row has a test or explicit negative assertion
- [ ] `DB_WITH_ENV_FALLBACK` not invoked when `authFamily` is OAuth
- [ ] `resolveWorkerOutboundWithChannelConnect` respects `blockLegacyFallback` for Instagram OAuth

---

## 4. Stale-job and rotation matrix

| Scenario | Expected behavior | Review |
| -------- | ----------------- | ------ |
| Job bound to connection A; credential rotates v4 → v5 | Worker resolves **v5** at execution | [ ] |
| Job bound to A; connection B becomes active | Job remains **A** | [ ] |
| Job bound to A; A becomes DISCONNECTED | Explicit failure; no switch to B | [ ] |
| Job bound to A; credential REAUTH_REQUIRED | Reauth classification; no env fallback | [ ] |
| Queue stores credential snapshot | Must not — connection binding only | [ ] |

---

## 5. Backward compatibility checklist

- [ ] Existing jobs without new binding fields still parse
- [ ] Legacy idempotency key unchanged
- [ ] No DB queue migration
- [ ] No persisted-job rewrite
- [ ] Missing binding not interpreted as OAuth
- [ ] Runtime flag **default OFF** leaves production flow unchanged
- [ ] Old worker + new payload compatibility documented
- [ ] New worker + old payload compatibility documented
- [ ] If rolling deployment compatibility unclear → flag is **blocker**

---

## 6. Error and logging checklist

### Prohibited in errors/logs

```text
token
ciphertext
full credential row
encryption key
raw provider response
cross-tenant existence detail
```

### Allowed sanitized classification

```text
errorCode
retryable
reauthRequired
provider
authFamily
deliveryPath
channelConnectionId (internal context only)
```

Review:

- [ ] `formatErrorForStorage` / `last_error` cannot contain token patterns
- [ ] Worker structured logs do not dump resolved config
- [ ] Ops UI does not show internal connection binding beyond necessary counts
- [ ] `TOKEN_LIKE` or equivalent applied to new Instagram OAuth diagnostics

---

## 7. Agent A PR diff watchlist

**Flag immediately:**

```text
payload_json.*accessToken
payload_json.*ciphertext
queue.*credentialVersion as authoritative
resolver.*loadEnvInstagramCredentials for OAuth path
instagram.*ENVIRONMENT_FALLBACK with authMethod=OAUTH
console.log.*resolved
ops.*payload_json
```

**Expected in scope:**

```text
domain/events.ts (or parallel) — binding fields
resolver — Instagram OAuth branch
sendOutboundMessage / enqueue — binding from conversation
tests — no-fallback, stale job, secret absence
feature flags — default OFF
```

---

## 8. Independent PR review workflow (Phase 10)

1. Create separate worktree on Agent A branch
2. `git diff master...HEAD` — scope only queue contract + resolver + tests + flags
3. Run secret scan, hidden/bidi scan, full test suite, typecheck, lint, build
4. Walk sections 1–7 above
5. Post GitHub review comment with verdict
6. **Do not merge**

### Verdict criteria

| Verdict | When |
| ------- | ---- |
| **PASS** | All checklist items satisfied; no blocking findings |
| **PASS WITH NOTES** | Minor non-security gaps; safe to merge with follow-ups |
| **CHANGES REQUESTED** | Security or contract violations fixable in PR |
| **BLOCKED** | Secret in queue, OAuth env fallback, tenant isolation break, or undeployable rolling compat |

### Review dimensions

- [ ] Scope
- [ ] Queue contract
- [ ] Secret absence
- [ ] Tenant isolation
- [ ] No fallback
- [ ] Lifecycle classification
- [ ] Token rotation
- [ ] Stale jobs
- [ ] Backward compatibility
- [ ] Rolling deployment compatibility
- [ ] Default-OFF flags
- [ ] No production wiring
- [ ] Tests/mock realism
- [ ] Hidden/bidi
- [ ] Secret scan
- [ ] Full suite/build
