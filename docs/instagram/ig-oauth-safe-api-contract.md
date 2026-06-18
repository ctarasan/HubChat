# Instagram OAuth — Safe Frontend API Contract (IG-AUTH-1B)

Design inputs for Agent A implementation. **Frontend-facing DTOs only** — no backend implementation prescribed.

Mirror pattern: `/api/channel-connect/facebook/*` + `facebookConnectModel.ts` parsers with `FORBIDDEN_LEAK_PATTERNS`.

**PAA** = `PENDING_AGENT_A_ARCHITECTURE`

---

## Route sketch (not implementation)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/channel-connect/instagram/status` | ADMIN | Connection summary |
| POST | `/api/channel-connect/instagram/oauth/start` | ADMIN | Begin OAuth; returns redirect URL |
| GET | `/api/channel-connect/instagram/oauth/session` | ADMIN | Poll callback/migration session |
| POST | `/api/channel-connect/instagram/oauth/complete` | ADMIN | Finalize after callback **PAA** |
| POST | `/api/channel-connect/instagram/health` | ADMIN | Capability / test connection |
| POST | `/api/channel-connect/instagram/reconnect` | ADMIN | Reauthorize / refresh trigger **PAA** |
| POST | `/api/channel-connect/instagram/migrate/start` | ADMIN | Begin legacy migration **PAA** |
| POST | `/api/channel-connect/instagram/migrate/cutover` | ADMIN | Confirm cutover **PAA** |
| POST | `/api/channel-connect/instagram/migrate/rollback` | ADMIN | Rollback canary **PAA** |
| POST | `/api/channel-connect/instagram/migrate/retire-legacy` | ADMIN | Retire manual credential **PAA** |
| POST | `/api/channel-connect/instagram/disconnect` | ADMIN | Disconnect **PAA** |

Existing `POST /api/channel-settings/instagram/test-connection` should converge with OAuth health or delegate to same resolver (**Agent A**).

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
type InstagramConnectDisplayState =
  | "NOT_CONNECTED" | "CONNECTING" | "CALLBACK_PROCESSING" | "CONNECTED"
  | "CONNECTED_LEGACY" | "MIGRATION_AVAILABLE" | "MIGRATION_IN_PROGRESS"
  | "TOKEN_EXPIRING" | "REFRESHING" | "REAUTH_REQUIRED" | "PERMISSION_MISSING"
  | "ACCOUNT_MISMATCH" | "REVOKED" | "PROVIDER_UNAVAILABLE"
  | "DISCONNECTING" | "DISCONNECTED" | "TEST_FAILED" | "CONFIGURATION_ERROR";

type InstagramCapability = "MESSAGING" | "COMMENTS" | "PROFILE_LOOKUP";

type InstagramCredentialHealth = {
  overall: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  deliveryPath: "OAUTH" | "LEGACY" | "ENVIRONMENT_FALLBACK"; // sanitized
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
  connectionId: string | null;           // UUID ok — tenant-scoped, not secret
  provider: "INSTAGRAM";
  authMethod: InstagramAuthMethod;
  status: InstagramConnectDisplayState;
  providerAccountDisplayName: string | null;  // @username
  providerAccountIdMasked: string | null;     // e.g. "···4567"
  linkedFacebookPageLabel: string | null;     // legacy only; never primary identity
  capabilities: InstagramCapability[];
  credentialHealth: InstagramCredentialHealth;
  tokenExpiresAt: string | null;         // ISO8601; server-computed only
  lastRefreshAt: string | null;
  lastRefreshStatus: "SUCCESS" | "FAILED" | "NOT_APPLICABLE" | null; // PAA schedule
  lastTestedAt: string | null;
  lastTestResult: "PASS" | "FAIL" | "UNKNOWN" | null;
  migrationStatus: InstagramMigrationStatus;
  legacyCredentialActive: boolean;
  oauthAvailable: boolean;
  manualLegacyAvailable: boolean;        // Advanced path toggle
  availableActions: InstagramConnectAction[];
  safeErrorCode: InstagramSafeErrorCode | null;
  message: string | null;              // sanitized operator text
  supportReferenceId: string | null;   // correlation id for support
  lastCheckedAt: string | null;
};
```

---

## OAuth start response

```typescript
type InstagramOAuthStartDto = {
  redirectUrl: string;       // Meta OAuth URL only
  oauthSessionId: string;    // opaque id for polling — not state secret
  expiresAt: string;         // session TTL
};
```

Frontend: navigate to `redirectUrl`; store only `oauthSessionId` in **session** memory (React state), not localStorage.

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
  }>; // PAA — multi-account picker
};
```

---

## Health / test connection response

```typescript
type InstagramHealthCheck = {
  id: string;                // e.g. "instagram_messaging", "ig_business_link"
  label: string;             // operator-readable
  status: "PASS" | "FAIL" | "SKIPPED" | "UNKNOWN";
  message: string | null;    // sanitized
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

Aligns test connection with runtime resolver path (**IG-AUTH-0 P1-4**).

---

## Migration status extension

```typescript
type InstagramMigrationProgressDto = {
  migrationStatus: InstagramMigrationStatus;
  legacyDeliveryActive: boolean;
  oauthDeliveryActive: boolean;
  canaryEnabled: boolean;           // PAA flag name
  rollbackAvailable: boolean;
  monitoringWindowEndsAt: string | null;  // PAA duration
  lastSmokeResult: "PASS" | "FAIL" | "PENDING" | null;
  message: string | null;
};
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

**Prohibited in `message`:** token fragments, `Bearer`, app secret, full Graph error bodies, stack traces, internal DB IDs beyond `supportReferenceId`.

---

## Polling / refresh behavior

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
2. Frontend reads session id only — NOT code (code handled server-side redirect target)
3. stripInstagramOAuthQueryParams() immediately
4. Poll oauth/session with session id
```

**PAA:** Exact callback URL path and whether code appears in browser URL at all (prefer server-side only).

---

## Credential source alignment (IG-AUTH-0)

| Field | Purpose |
|-------|---------|
| `credentialHealth.deliveryPath` | Shows OAuth vs Legacy vs Environment fallback |
| `authMethod` | Distinguishes CONNECTED vs CONNECTED_LEGACY |
| `lastTestResult` + `credentialHealth` | Test/runtime alignment |

No cross-tenant fields in DTO. `connectionId` is tenant-scoped UUID.

---

## PENDING_AGENT_A_ARCHITECTURE

| Topic | UX blocked until decided |
|-------|-------------------------|
| Exact OAuth permission strings | Capability checklist labels |
| Multi IG account per Meta login | Account picker UI |
| Refresh schedule / lazy refresh | REFRESHING state duration |
| Canary flag + cutover API shape | Migration progress DTO |
| Whether disconnect revokes Meta token | Disconnect copy finalization |
| Webhook secret remains ENV | Whether verify/app secret fields stay in Advanced manual |
| Token family at OAuth output | Page token vs IG Login — IG-AUTH-0 says Page token for messaging |
