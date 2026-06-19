# IG-AUTH-2E.1 — OAuth DM Text Delivery Security Review Checklist

Use when reviewing Agent A IG-AUTH-2E.1 PR. Baseline: master `d4865e4` (post IG-AUTH-2E.0). Companion: [`ig-auth-2e-1b-security-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-1b-security-review-prep.md), [`ig-auth-2e-0-outbound-provider-contract.md`](ig-auth-2e-0-outbound-provider-contract.md).

**Expected Agent A scope:** OAuth DM text provider client / adapter foundation, mocked tests, default-OFF flags. **Not expected:** worker wire, queue binding, image, private reply, UI, live provider calls.

---

## 1. Scope gate

### Allowed

- OAuth Instagram text send provider client (graph.instagram.com)
- Text payload builder / validator
- Adapter or service module callable with resolved OAuth credential + IGSID + text
- Unit/integration tests with mocked HTTP
- Error taxonomy mapping for text send
- Optional `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` (default OFF)
- Agent A implementation report citing official Meta docs

### Forbidden (BLOCKED if present)

- Image/media send (2E.2)
- Private reply / comment_id recipient (2F)
- Worker/outboundWorker wiring
- Outbox/RPC queue binding emission (2E.3)
- `sendOutboundMessage.ts` production path cutover
- Channel Settings OAuth UI
- Webhook changes
- Token refresh scheduler
- Legacy credential retirement
- Production env values or flag-on defaults
- Live Meta HTTP calls in CI or runtime
- Schema/migration changes (unless explicitly scoped — default forbidden)
- `graph.facebook.com` for OAuth text send

| Verdict | Condition |
| --- | --- |
| PASS | Allowed scope only |
| CHANGES REQUESTED | Minor scope creep fixable (e.g. doc-only) |
| BLOCKED | Worker wire, queue, migration, live send, image/private reply |

---

## 2. Provider endpoint correctness

Official source: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)

- [ ] Host is `graph.instagram.com` only
- [ ] Path is `POST /{version}/{IG_ID}/messages` or `POST /{version}/me/messages` (documented choice)
- [ ] API version from central config — not hard-coded, not user-supplied
- [ ] Token via `Authorization: Bearer` header only
- [ ] No `access_token` query parameter on OAuth send URL
- [ ] Content-Type `application/json`
- [ ] Text body matches `{ recipient: { id }, message: { text } }`
- [ ] Agent report links official doc with check date

| Verdict | Condition |
| --- | --- |
| PASS | All checks satisfied |
| CHANGES REQUESTED | Wrong host/path/token transport fixable |
| BLOCKED | Facebook Graph Page endpoint used for OAuth text |

---

## 3. ID semantics

- [ ] Recipient is `InstagramMessagingScopedUserId` / IGSID
- [ ] Sender path uses `InstagramProfessionalAccountId` from credential
- [ ] `InstagramOAuthProviderUserId` not used as recipient
- [ ] Username never used as routing key
- [ ] Facebook Page ID not in OAuth URL path
- [ ] PSID not accepted as Instagram recipient
- [ ] Professional account ID rejected if passed as recipient (test)

| Verdict | Condition |
| --- | --- |
| PASS | Strict separation enforced |
| CHANGES REQUESTED | Weak typing but correct runtime checks |
| BLOCKED | Cross-type routing accepted |

---

## 4. Exact channel_connection_id binding

- [ ] Public/service API requires `channelConnectionId` (or equivalent explicit binding input)
- [ ] Resolver invoked with exact `tenantId` + `channelConnectionId`
- [ ] No tenant-global Instagram credential lookup
- [ ] No "first active connection" heuristic
- [ ] Missing connection ID fails closed before provider call

| Verdict | Condition |
| --- | --- |
| PASS | Exact binding required |
| CHANGES REQUESTED | Binding optional at internal layer but enforced at adapter entry |
| BLOCKED | Tenant-only resolution for OAuth send |

---

## 5. Resolver behavior

- [ ] Uses `resolveForDelivery` (or thin wrapper) with `INSTAGRAM_BUSINESS_LOGIN` + `DATABASE_ONLY`
- [ ] ACTIVE and TOKEN_EXPIRING allowed per policy
- [ ] REAUTH_REQUIRED, REVOKED, EXPIRED, PENDING fail closed
- [ ] Decrypt path uses repository only — no ENV read
- [ ] Returns access token + `providerInstagramAccountId` — not Page ID

| Verdict | Condition |
| --- | --- |
| PASS | Matches IG-AUTH-2B/2D resolver contract |
| CHANGES REQUESTED | Minor status edge case undocumented |
| BLOCKED | Custom weak resolver bypassing lifecycle gates |

---

## 6. Feature flags default OFF

Expected flags:

| Flag | Default |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | OFF |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | OFF |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` (if added) | OFF |

- [ ] Absent = OFF
- [ ] Blank / false / unsupported = OFF
- [ ] Text flag does not enable image/runtime/connect
- [ ] No production env values in PR

| Verdict | Condition |
| --- | --- |
| PASS | All flags default OFF |
| BLOCKED | Production flag-on or env value change |

---

## 7. No-fallback enforcement

Fail-closed cases — each must **not** call legacy adapter, Page token path, ENV, or alternate connection:

- [ ] Runtime flag OFF
- [ ] Outbound text flag OFF (if separate)
- [ ] Missing `channelConnectionId`
- [ ] Resolver disabled
- [ ] Credential not found
- [ ] REAUTH_REQUIRED
- [ ] Token expired/revoked
- [ ] Permission missing
- [ ] Ambiguous legacy+OAuth config
- [ ] Invalid/missing IGSID
- [ ] OAuth provider error (no legacy retry)

| Verdict | Condition |
| --- | --- |
| PASS | All cases fail closed without fallback |
| CHANGES REQUESTED | One edge case missing test |
| BLOCKED | Any OAuth→legacy fallback path |

---

## 8. Text payload validation

- [ ] Reject blank/whitespace-only text
- [ ] Enforce UTF-8 byte length ≤ 1000
- [ ] Reject null recipient
- [ ] Reject empty recipient ID
- [ ] No arbitrary client-supplied JSON keys in provider body
- [ ] Links allowed only as valid text per provider rules (no separate URL field injection)

| Verdict | Condition |
| --- | --- |
| PASS | Validation before HTTP |
| CHANGES REQUESTED | Missing length test |
| BLOCKED | Unvalidated pass-through to provider |

---

## 9. Provider response parsing

- [ ] Success: require `message_id`; optional `recipient_id`
- [ ] Malformed success JSON rejected
- [ ] HTTP non-2xx mapped to taxonomy
- [ ] Graph `error.code` / `error_subcode` parsed safely
- [ ] No raw provider body in thrown errors exposed publicly
- [ ] `message_id` mapped to outbound `external_message_id` contract (type level OK in 2E.1)

| Verdict | Condition |
| --- | --- |
| PASS | Strict parse + sanitize |
| CHANGES REQUESTED | Missing subcode mapping |
| BLOCKED | Raw body returned to caller/API |

---

## 10. Error taxonomy

Minimum codes for 2E.1 text path:

| Code | Retry? | Notes |
| --- | --- | --- |
| `OAUTH_RUNTIME_DISABLED` | No | Flag OFF |
| `CREDENTIAL_NOT_FOUND` | No | |
| `REAUTH_REQUIRED` | No | |
| `TOKEN_EXPIRED` / `TOKEN_REVOKED` | No | |
| `PERMISSION_MISSING` | No | |
| `RECIPIENT_UNAVAILABLE` | No | Invalid IGSID |
| `MESSAGE_WINDOW_CLOSED` | No | Align with legacy classifier if reused |
| `RATE_LIMITED` | Yes | HTTP 429 |
| `PROVIDER_UNAVAILABLE` | Yes | Timeout / 5xx |
| `PROVIDER_CONTRACT_ERROR` | No | Malformed response |
| `CONFIGURATION_AMBIGUOUS` | No | Dual legacy+OAuth |
| `DELIVERY_FAILED_RETRYABLE` | Yes | Policy-dependent |
| `DELIVERY_FAILED_TERMINAL` | No | |

- [ ] Public/API surfaces sanitized only
- [ ] No stack traces to client

---

## 11. Secret-safe logging

Review search:

```powershell
rg -n "Authorization|Bearer|accessToken|access_token|ciphertext|providerResponse|raw" app src worker tests
```

- [ ] No token in logs, errors, audit, or test output assertions on real patterns
- [ ] HTTP client does not log request headers
- [ ] Provider response not persisted raw
- [ ] Message text not logged at info level (if logged at all, truncated/redacted)

| Verdict | Condition |
| --- | --- |
| PASS | Secret-safe |
| CHANGES REQUESTED | Debug log too verbose — fix before merge |
| BLOCKED | Token/ciphertext in diff or default log path |

---

## 12. Worker / production cutover boundary

- [ ] `worker/main.ts` unchanged (or diff empty for Instagram OAuth wire)
- [ ] `outboundWorker.ts` unchanged
- [ ] `sendOutboundMessage.ts` unchanged (or no Instagram OAuth branch)
- [ ] Outbox RPC unchanged
- [ ] No real outbound message to Meta in tests (mock fetch only)

| Verdict | Condition |
| --- | --- |
| PASS | Foundation only |
| BLOCKED | Production send path wired |

---

## 13. Legacy regression

- [ ] Legacy `InstagramAdapter` on `graph.facebook.com` unchanged
- [ ] Facebook outbound unchanged
- [ ] LINE outbound unchanged
- [ ] Private reply path unchanged
- [ ] Webhook handlers unchanged
- [ ] Legacy Instagram tenant resolver unchanged

| Verdict | Condition |
| --- | --- |
| PASS | No regression diff |
| CHANGES REQUESTED | Incidental test flake |
| BLOCKED | Legacy path behavior changed without scope |

---

## 14. Test quality

### Provider client (mocked HTTP)

- [ ] Fixed endpoint host/path/version
- [ ] Bearer header present; no token in URL
- [ ] Correct JSON payload shape
- [ ] Blank text rejected
- [ ] Recipient IGSID required
- [ ] Success `message_id` parsed
- [ ] Malformed success rejected
- [ ] 401/403 → reauth classification
- [ ] Permission error → terminal
- [ ] 429 retryable
- [ ] 5xx/timeout retryable
- [ ] Response/token not in error string snapshots

### Adapter / service

- [ ] Runtime flag OFF → fail closed, provider not called
- [ ] Missing `channelConnectionId` → fail closed
- [ ] Resolver called with exact tenant + connection
- [ ] ACTIVE credential → mocked send success
- [ ] REAUTH_REQUIRED → fail closed, provider not called
- [ ] Expired/revoked → fail closed
- [ ] Ambiguous config → fail closed
- [ ] No ENV fallback (spy on env reads)
- [ ] No legacy adapter invocation (spy)
- [ ] Professional account ID rejected as recipient
- [ ] Username rejected as recipient

### Regression guards

- [ ] Worker/main isolation test or zero diff
- [ ] Full suite pass

| Verdict | Condition |
| --- | --- |
| PASS | Matrix covered with spies on fallback paths |
| PASS WITH NOTES | One non-critical gap |
| CHANGES REQUESTED | Missing fail-closed or fallback spy |
| BLOCKED | No meaningful tests |

---

## 15. Deployment / production boundary

- [ ] No production flag enablement
- [ ] No `.env` / Railway / Vercel config changes
- [ ] No migration execution instructions
- [ ] No deployment scripts
- [ ] No customer canary
- [ ] No legacy retirement
- [ ] Docs state: **2E.1 foundation ≠ production delivery**

| Verdict | Condition |
| --- | --- |
| PASS | Boundary clear |
| BLOCKED | Any production activation artifact |

---

## Independent PR review workflow

1. Separate worktree on Agent A branch
2. Scope gate (§1)
3. Walk §2–§15
4. Provider contract matrix cross-check
5. Secret scan, hidden/bidi scan, typecheck, lint, tests, build
6. Post GitHub comment with verdict
7. **Do not merge**

### Final verdict criteria

| Verdict | When |
| --- | --- |
| **PASS** | OAuth text client correct; IDs separated; fail-closed; mocked tests; flags OFF; no worker/queue cutover |
| **PASS WITH NOTES** | Minor doc/test gaps only |
| **CHANGES REQUESTED** | Endpoint/token/fallback/test gaps |
| **BLOCKED** | Scope violation, production cutover, secrets, live send |

---

## Merge sequencing note

This checklist supports **IG-AUTH-2E.1** foundation review only. Queue binding (2E.3), worker route selection, and production canary (2E.7) require separate review after implementation.
