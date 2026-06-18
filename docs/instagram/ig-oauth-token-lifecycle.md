# Instagram OAuth — Token Lifecycle (IG-AUTH-1A)

> **Status:** Architecture design only. No implementation.
> **Official Meta sources checked:** 2026-06-18 — [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)

---

## Refresh terminology (non-negotiable)

```text
Meta does not provide a separate OAuth refresh-token credential for this design.

ig_refresh_token is the Meta grant_type/action used to refresh an eligible long-lived Instagram access token.

The refresh response returns a refreshed access token and expiry metadata.

HubChat REFRESH_TOKEN schema terminology is not provider evidence and is not selected for the target credential model.
```

HubChat must **not** store or assume a provider-issued refresh token.

---

## Provider token facts (official Meta)

| Stage | Duration / rule | Endpoint | Notes |
| --- | --- | --- | --- |
| Authorization code | **1 hour**, single use | Redirect `?code=` | Business Login Step 1 |
| Short-lived access token | **1 hour** | `POST api.instagram.com/oauth/access_token` | Exchange code server-side |
| Long-lived access token | **60 days** (`expires_in` seconds) | `GET graph.instagram.com/access_token?grant_type=ig_exchange_token` | Server-side only (requires app secret) |
| Access-token refresh action | Existing long-lived token **≥ 24 hours old**, valid, `instagram_business_basic` granted | `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` | Returns refreshed 60-day access token + `expires_in` |
| Provider-issued refresh-token credential | **Does not exist** for Instagram Login per Meta docs | — | HubChat `REFRESH_TOKEN` credential type is **not** provider evidence |
| Expired beyond refresh window | Token **cannot** be refreshed after 60 days without refresh | — | Requires full re-auth (Business Login) |

---

## Connection lifecycle state machine

```text
NOT_CONNECTED ──oauth/start──► CONNECTING ──callback OK──► CONNECTED
                                    │                         │
                                    │ fail                    ├──health OK──► READY (operational)
                                    ▼                         │
                                  ERROR                       ├──expiry window──► TOKEN_EXPIRING
                                                              │
CONNECTED ──refresh job──► REFRESHING ──success──► CONNECTED (new expires_at)
     │                         │
     │                         └──fail terminal──► REAUTH_REQUIRED
     │
     ├──provider revoke──► REVOKED
     ├──operator disconnect──► DISCONNECTED
     └──health fail──► ERROR
```

### State definitions

| State | Meaning | Operator visibility |
| --- | --- | --- |
| `NOT_CONNECTED` | No credential row or empty | IG-AUTH-0B `NOT_CONFIGURED` |
| `CONNECTING` | OAuth transaction pending | `CONNECTING` (future UI) |
| `CONNECTED` | Token stored; health not yet verified | Transitional |
| `TOKEN_EXPIRING` | `expires_at` within refresh threshold | Banner (future) |
| `REFRESHING` | Maintenance job in flight | Internal / ops only |
| `REAUTH_REQUIRED` | Refresh failed or token expired beyond provider rules | `REAUTH_REQUIRED` |
| `REVOKED` | Provider or operator revocation | `REVOKED` |
| `DISCONNECTED` | Operator explicit disconnect | `DISCONNECTED` |
| `ERROR` | Transient or unknown health failure | `ERROR` + sanitized code |

**Mapping note:** HubChat `channel_connection_status` already includes `RECONNECT_REQUIRED`, `REVOKED`, `READY`, `ERROR` — align OAuth states to existing enum where possible; add logical `TOKEN_EXPIRING` / `REFRESHING` in metadata before schema enum extension.

---

## Refresh ownership

### Preferred: dedicated token-maintenance job

```text
Owner:     Scheduled service (Vercel Cron or Railway worker cron topic)
Frequency: Every 6 hours (configurable)
Selector:  channel_connections WHERE auth_family = INSTAGRAM_USER_OAUTH
           AND token_expires_at < now() + refresh_threshold
           AND refresh_eligible_at <= now()
           AND status NOT IN (REVOKED, DISCONNECTED, REAUTH_REQUIRED)
```

| Parameter | Recommended value | Rationale |
| --- | --- | --- |
| `refresh_threshold` | 7 days before `token_expires_at` | Meta 60-day TTL; buffer for retries |
| `refresh_eligible_at` | `connected_at + 24h` or last long-lived issue + 24h | Meta requires token ≥24h old |
| Max retries per cycle | 3 with exponential backoff | Avoid provider rate limits |
| Terminal after | Refresh failures with invalid-token codes | → `REAUTH_REQUIRED` |
| Concurrency lock | `last_refresh_at` + row lock / job idempotency key | Prevent duplicate refresh |
| Atomic update | Single DB transaction: new ciphertext + `token_expires_at` + `credential_version++` | No partial token reads |
| Queue during refresh | Outbound may use **pre-refresh** token until atomic swap completes; if refresh fails mid-flight, next send triggers resolver health check | Short window; log `ig_token_refresh_in_progress` |
| Operator notification | Connection status → `REAUTH_REQUIRED`; Channel Settings banner | IG-AUTH-0B gap |
| Error leakage | Store `last_refresh_error_code` only (sanitized); never log token | Security |

### Not preferred: refresh inside outbound request

Rejected — causes latency spikes, race conditions, and unbounded queue retries on expiry.

---

## OAuth connect-time exchange flow

```text
1. POST oauth/start → create transaction + state
2. Redirect → instagram.com/oauth/authorize?scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,...
3. GET oauth/callback?code=&state=
4. POST api.instagram.com/oauth/access_token → short-lived token + user_id + permissions
5. GET graph.instagram.com/access_token?grant_type=ig_exchange_token → long-lived token + expires_in
6. GET graph.instagram.com/me?fields=user_id,username,account_type,profile_picture_url → bind provider_instagram_account_id
7. Encrypt + store ACCESS_TOKEN; set token_expires_at; set refresh_eligible_at = now + 24h
8. Health probes → READY
```

### Requested scopes (minimum for HubChat consumers)

| Scope | Consumer |
| --- | --- |
| `instagram_business_basic` | Identity, refresh eligibility, profile |
| `instagram_business_manage_messages` | DM text/image |
| `instagram_business_manage_comments` | Private reply |

Additional scopes (`instagram_business_content_publish`, etc.) — **not required** for current HubChat runtime consumers.

---

## Provider error handling (architecture)

| Error class | Resolver/outbound behavior | Connection state |
| --- | --- | --- |
| Invalid/expired token (OAuthException code 190 class) | Terminal outbound failure | `REAUTH_REQUIRED` |
| Permission missing / scope | Terminal; `PERMISSION_MISSING` test status | `ERROR` |
| Rate limit | Retryable queue backoff | No state change |
| Transient 5xx | Retryable | No state change |
| Revoked by user | Terminal | `REVOKED` |

**Unknown:** Exact Instagram Login error code mapping — capture during Phase 2 non-production testing.

---

## Revocation and disconnect

| Action | Behavior |
| --- | --- |
| Operator disconnect | `POST disconnect`; mark `DISCONNECTED`; stop refresh; optional Meta token invalidate if documented |
| Provider revoke | Next API call or webhook → `REVOKED` |
| Reauthorize | `POST reauthorize` → new OAuth transaction bound to same `channel_connection_id` |

---

## Queue handling on expiry

| Scenario | Policy |
| --- | --- |
| Send with expired token | Resolver pre-check → terminal `REAUTH_REQUIRED`; **no infinite retry** |
| Send during `TOKEN_EXPIRING` | Allow if token still valid; refresh job runs in parallel |
| Send after failed refresh | Terminal until operator reauth |
| Legacy ENV fallback | **Blocked** for `INSTAGRAM_USER_OAUTH` connections |

Extend `classifyOutboundProviderFailure` for `channel === "INSTAGRAM"` + OAuth token errors (IG-AUTH-0 P2-1 gap).

---

## Official Meta sources (2026-06-18)

- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login) — code TTL, short/long-lived exchange, refresh rules
- [Get Started (Instagram Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started) — token types from dashboard vs login flow
