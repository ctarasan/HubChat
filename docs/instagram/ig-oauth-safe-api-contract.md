# Instagram OAuth — Safe Frontend API Contract (IG-AUTH-1B)

Design inputs aligned with **IG-AUTH-1A** (merged PR #241). **Frontend-facing DTOs only** — no backend implementation prescribed.

Mirror pattern: `/api/channel-connect/facebook/*` + `facebookConnectModel.ts` parsers with `FORBIDDEN_LEAK_PATTERNS`.

---

## Route naming (IG-AUTH-2C implementation decision)

OAuth route **responsibilities** are architecture decisions. **Final route prefix is deferred to IG-AUTH-2C** implementation discovery.

```text
The preferred convention is channel-connect for consistency with current Facebook OAuth code:
  /api/channel-connect/instagram/oauth/...

channel-connections remains an alternative requiring explicit review before use.

The frontend must not hard-code a route family before the IG-AUTH-2C contract is approved.
```

### Logical responsibilities (prefix-agnostic)

| Responsibility | Notes |
|----------------|-------|
| OAuth start | ADMIN; create transaction; return Meta authorize URL |
| OAuth callback | Server-side code exchange; long-lived exchange; persist credential |
| OAuth session poll | Poll migration/callback progress |
| Health / test connection | Same resolver as runtime (ADR-7) |
| Reauthorize | New OAuth transaction bound to `channel_connection_id` |
| Migration start / cutover / rollback / retire-legacy | Non-destructive legacy migration |
| Disconnect | Mark disconnected; stop refresh scheduling |

Existing `POST /api/channel-settings/instagram/test-connection` should converge with OAuth health or delegate to the unified resolver.

---

## Token transport (backend-owned)

```text
Token transport is endpoint-specific and owned by the backend adapter.

The frontend does not send or receive access tokens.

Bearer versus access_token query transport must be verified per official Meta endpoint during implementation — do not generalize across all Graph calls.

Tokens must never appear in application logs, UI responses, analytics, support references, or persisted request URLs.
```

Request sanitization must cover query strings and headers in error paths.

---

## Refresh (server-owned)

```text
ig_refresh_token is a Meta grant_type/action used to refresh an eligible long-lived Instagram access token.

It is not a separately issued OAuth refresh-token credential.

The frontend receives lifecycle metadata only (tokenExpiresAt, lastRefreshAt, lastRefreshStatus) and never handles token refresh.
```

---

## Prohibited response fields (never in JSON to browser)

```text
accessToken
refreshToken
authorizationCode
appSecret
webhookVerifyToken
ciphertext
encryptedSecret
rawProviderResponse
providerAccessToken
longLivedToken
shortLivedToken
```

Parser must reject responses matching token-like patterns (extend `FORBIDDEN_LEAK_PATTERNS` from `channelSettingsModel.ts`).

---

## Core DTO: `InstagramConnectStatusDto`

```typescript
type InstagramAuthMethod = "OAUTH" | "LEGACY" | "NONE";
type InstagramDeliveryPath = "OAUTH_DB" | "LEGACY_DB" | "ENVIRONMENT_FALLBACK";

type InstagramConnectDisplayState =
  | "NOT_CONNECTED" | "CONNECTING" | "CALLBACK_PROCESSING" | "CONNECTED"
  | "CONNECTED_LEGACY" | "MIGRATION_AVAILABLE" | "MIGRATION_IN_PROGRESS"
  | "TOKEN_EXPIRING" | "REFRESHING" | "REAUTH_REQUIRED" | "PERMISSION_MISSING"
  | "ACCOUNT_MISMATCH" | "REVOKED" | "PROVIDER_UNAVAILABLE"
  | "DISCONNECTING" | "DISCONNECTED" | "TEST_FAILED" | "CONFIGURATION_ERROR";

type InstagramCapability = "MESSAGING" | "COMMENTS" | "PROFILE_LOOKUP";

type InstagramCredentialHealth = {
  overall: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  deliveryPath: InstagramDeliveryPath;
  messaging: "OK" | "DEGRADED" | "ERROR" | "UNKNOWN";
  comments: "OK" | "DEGRADED" | "ERROR" | "UNKNOWN";
  profileLookup: "OK" | "DEGRADED" | "ERROR" | "UNKNOWN" | "PARKED";
};

type InstagramMigrationStatus =
  | "NOT_APPLICABLE"
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "CANARY"
  | "CUTOVER_COMPLETE"
  | "ROLLBACK_ACTIVE"
  | "LEGACY_RETIRED";

type InstagramConnectAction =
  | "CONNECT" | "TEST" | "REAUTHORIZE" | "MIGRATE" | "CUTOVER"
  | "ROLLBACK" | "RETIRE_LEGACY" | "DISCONNECT" | "RETRY" | "VIEW_PERMISSIONS";

type InstagramConnectStatusDto = {
  connectionId: string | null;
  provider: "INSTAGRAM";
  authMethod: InstagramAuthMethod;
  status: InstagramConnectDisplayState;
  providerAccountDisplayName: string | null;  // @username
  providerAccountIdMasked: string | null;     // Professional Account ID masked
  linkedFacebookPageLabel: string | null;     // legacy only; never primary identity
  capabilities: InstagramCapability[];
  credentialHealth: InstagramCredentialHealth;
  tokenExpiresAt: string | null;         // ISO8601; server-computed only
  lastRefreshAt: string | null;
  lastRefreshStatus: "SUCCESS" | "FAILED" | "NOT_APPLICABLE" | null;
  lastTestedAt: string | null;
  lastTestResult: "PASS" | "FAIL" | "UNKNOWN" | null;
  migrationStatus: InstagramMigrationStatus;
  legacyCredentialActive: boolean;
  oauthAvailable: boolean;
  manualLegacyAvailable: boolean;
  availableActions: InstagramConnectAction[];
  safeErrorCode: InstagramSafeErrorCode | null;
  message: string | null;
  supportReferenceId: string | null;
  lastCheckedAt: string | null;
};
```

---

## OAuth delivery-path invariant (non-negotiable)

For OAuth-managed Instagram connections:

```text
credentialHealth.deliveryPath must be OAUTH_DB.

ENVIRONMENT_FALLBACK is invalid when authMethod = OAUTH.

The UI must never present an OAuth connection as healthy when runtime is using environment fallback.
```

| authMethod | deliveryPath | Valid? | UI treatment if invalid |
|------------|--------------|--------|-------------------------|
| `OAUTH` | `OAUTH_DB` | Yes | Normal healthy OAuth UI |
| `OAUTH` | `LEGACY_DB` | No | `CONFIGURATION_ERROR` or `REAUTH_REQUIRED` per server |
| `OAUTH` | `ENVIRONMENT_FALLBACK` | **No** | `CONFIGURATION_ERROR` — never show healthy OAuth |
| `LEGACY` | `LEGACY_DB` | Yes | `CONNECTED_LEGACY` |
| `LEGACY` | `ENVIRONMENT_FALLBACK` | Temporary migration-only | Warn banner; not target end state |

Frontend **must not** compute or override `deliveryPath`.

---

## OAuth start response

```typescript
type InstagramOAuthStartDto = {
  redirectUrl: string;
  oauthSessionId: string;
  expiresAt: string;
};
```

Frontend: navigate to `redirectUrl`; store only `oauthSessionId` in **session memory** (React state), not localStorage.

---

## OAuth session poll response

```typescript
type InstagramOAuthSessionDto = {
  oauthSessionId: string;
  stage: "PENDING" | "CALLBACK_RECEIVED" | "EXCHANGING" | "ACCOUNT_SELECTION"
       | "COMPLETED" | "FAILED" | "EXPIRED";
  displayState: InstagramConnectDisplayState;
  safeErrorCode: InstagramSafeErrorCode | null;
  message: string | null;
  supportReferenceId: string | null;
  accounts?: Array<{
    providerAccountDisplayName: string;
    providerAccountIdMasked: string;
  }>; // Unknown until IG-AUTH-2C — multi-account behavior TBD
};
```

---

## Health / test connection response

```typescript
type InstagramHealthCheck = {
  id: string;
  label: string;
  status: "PASS" | "FAIL" | "SKIPPED" | "UNKNOWN";
  message: string | null;
};

type InstagramHealthResponseDto = {
  ok: boolean;
  checks: InstagramHealthCheck[];
  credentialHealth: InstagramCredentialHealth;
  lastTestedAt: string;
  safeErrorCode: InstagramSafeErrorCode | null;
  supportReferenceId: string | null;
};
```

Uses same resolver + `channel_connection_id` as Railway worker (IG-AUTH-1A ADR-7).

---

## Migration status extension

```typescript
type InstagramMigrationProgressDto = {
  migrationStatus: InstagramMigrationStatus;
  legacyDeliveryActive: boolean;
  oauthDeliveryActive: boolean;
  canaryEnabled: boolean;
  rollbackAvailable: boolean;
  operationalCheckpointHours: 24 | 48 | 72 | null;  // post-cutover ops checks only
  evidenceWindowEndsAt: string | null;            // 14-day architecture window (IG-AUTH-1A Phase 8)
  lastSmokeResult: "PASS" | "FAIL" | "PENDING" | null;
  message: string | null;
};
```

**Monitoring distinction:**

```text
operationalCheckpointHours (24/48/72): operational monitoring after canary cutover — does NOT authorize legacy retirement.

evidenceWindowEndsAt: full 14-day architecture evidence window required before retire-legacy action is enabled.
```

---

## Safe error codes

```typescript
type InstagramSafeErrorCode =
  | "AUTHORIZATION_DENIED"
  | "INVALID_CALLBACK_STATE"
  | "CALLBACK_EXPIRED"
  | "TOKEN_EXCHANGE_FAILED"
  | "PERMISSION_MISSING"
  | "ACCOUNT_NOT_PROFESSIONAL"
  | "ACCOUNT_MISMATCH"
  | "ACCOUNT_ALREADY_CONNECTED"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "REFRESH_FAILED"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_UNAVAILABLE"
  | "CONNECTION_TEST_FAILED"
  | "CONFIGURATION_ERROR";
```

### Error presentation contract

| Code | Title | Explanation (template) | Safe action | Retryable | Support ref |
|------|-------|------------------------|-------------|-----------|-------------|
| `AUTHORIZATION_DENIED` | Authorization declined | You declined access on Meta or closed the window. | Connect Instagram | Yes | Optional |
| `INVALID_CALLBACK_STATE` | Connection session invalid | This connection attempt expired or was already used. | Connect Instagram | Yes | Yes |
| `CALLBACK_EXPIRED` | Connection timed out | The Meta authorization window expired. | Connect Instagram | Yes | Optional |
| `TOKEN_EXCHANGE_FAILED` | Could not complete connection | HubChat could not finish authorization. | Retry | Yes | Yes |
| `PERMISSION_MISSING` | Permissions missing | Required Instagram permissions were not granted. | Reauthorize | After Meta fix | Yes |
| `ACCOUNT_NOT_PROFESSIONAL` | Not a professional account | This Instagram account must be a professional/business account. | Use different account | No | Optional |
| `ACCOUNT_MISMATCH` | Wrong account | The connected account does not match your selection. | Choose account | Yes | Optional |
| `ACCOUNT_ALREADY_CONNECTED` | Account in use | This Instagram account is linked to another workspace. | Contact support | No | **Required** |
| `TOKEN_EXPIRED` | Token expired | Instagram authorization expired. | Reauthorize | Yes | Optional |
| `TOKEN_REVOKED` | Access revoked | Meta access was revoked. | Reauthorize | Yes | Optional |
| `REFRESH_FAILED` | Refresh failed | HubChat could not refresh the connection automatically. | Reauthorize | Yes | Yes |
| `PROVIDER_RATE_LIMIT` | Meta rate limit | Meta is temporarily limiting requests. | Retry later | Yes after delay | Yes |
| `PROVIDER_UNAVAILABLE` | Meta unavailable | Meta services are temporarily unavailable. | Retry later | Yes | Optional |
| `CONNECTION_TEST_FAILED` | Connection test failed | One or more capability checks failed. | View checks / Retry | Yes | Yes |
| `CONFIGURATION_ERROR` | Configuration error | HubChat Instagram configuration needs attention. | Contact support | No | **Required** |

**Prohibited in `message`:** token fragments, `Bearer`, app secret, full Graph error bodies, stack traces.

---

## Polling behavior

| Scenario | Interval | Max duration | Stop condition |
|----------|----------|--------------|----------------|
| Callback processing | 2s → 5s backoff | 2 min | Terminal session stage |
| Migration progress | 5s | 10 min | migration terminal |
| Refresh in progress | 3s | 1 min | status ≠ REFRESHING |
| Status after tab focus | Single fetch | — | Debounce 5s |

**No request loops < 1s.** Use `AbortController` on unmount.

---

## Callback URL handling

```text
1. Callback lands on /dashboard/channel-settings?ig_oauth=1&session={id}
2. Frontend reads session id only — NOT authorization code
3. stripInstagramOAuthQueryParams() immediately
4. Poll oauth/session with session id
```

Prefer server-side-only code handling (IG-AUTH-1A ADR-4). Exact callback path is IG-AUTH-2C.

---

## Remaining unknowns (frontend contract)

| Topic | Missing evidence |
|-------|------------------|
| Final route prefix | IG-AUTH-2C — `channel-connect` preferred |
| Multi-account picker shape | Provider/product behavior |
| Exact per-endpoint transport | Implementation-phase Meta doc verification |
| Disconnect Meta revocation | Provider doc at implementation |
