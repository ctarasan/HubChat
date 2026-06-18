# Instagram OAuth — UI State Matrix (IG-AUTH-1B)

Frontend display states for `InstagramConnectCard`. States are **server-derived** via safe status DTO; the browser does not compute token expiry from raw credentials.

Legend: **PAA** = `PENDING_AGENT_A_ARCHITECTURE`

---

## State index

| # | State | When shown |
|---|-------|------------|
| 1 | `NOT_CONNECTED` | No IG connection row or disabled empty |
| 2 | `CONNECTING` | OAuth start in flight / redirect pending |
| 3 | `CALLBACK_PROCESSING` | Returned from Meta; server exchanging |
| 4 | `CONNECTED` | OAuth healthy + tested |
| 5 | `CONNECTED_LEGACY` | Manual/legacy credential active |
| 6 | `MIGRATION_AVAILABLE` | Legacy active; OAuth migration offered |
| 7 | `MIGRATION_IN_PROGRESS` | Migration started; canary or dual-path |
| 8 | `TOKEN_EXPIRING` | Server: expiry within warning threshold |
| 9 | `REFRESHING` | Server refresh in progress |
| 10 | `REAUTH_REQUIRED` | Refresh failed or expiry passed |
| 11 | `PERMISSION_MISSING` | Capability probe found missing scope |
| 12 | `ACCOUNT_MISMATCH` | Wrong IG account for tenant intent |
| 13 | `REVOKED` | Provider revoked token |
| 14 | `PROVIDER_UNAVAILABLE` | Meta outage / rate limit |
| 15 | `DISCONNECTING` | Disconnect API in flight |
| 16 | `DISCONNECTED` | No active connection |
| 17 | `TEST_FAILED` | Health/test failed; connection may exist |
| 18 | `CONFIGURATION_ERROR` | HubChat config invalid; not provider auth |

---

## Full state matrix

| State | Badge | Explanation | Primary action | Secondary action | API dependency | Retry behavior | Operator guidance |
|-------|-------|-------------|----------------|------------------|----------------|----------------|-------------------|
| `NOT_CONNECTED` | Not connected | Instagram is not linked to this workspace. | Connect Instagram | — | `GET .../status` | N/A | Use OAuth connect; manual only under Advanced if enabled |
| `CONNECTING` | Connecting… | Redirecting to Meta for authorization. | — (disabled) | Cancel | `POST .../oauth/start` | Auto on network blip once | Do not close browser until return |
| `CALLBACK_PROCESSING` | Completing connection… | HubChat is verifying your Meta authorization. | — | — | `GET .../oauth/session`, `POST .../complete` **PAA** | Poll status 2s → 5s backoff, max 2 min | Wait; refresh safe — server idempotent |
| `CONNECTED` | Connected | @username linked via OAuth. Capabilities healthy. | Test connection | Reauthorize | `GET .../status`, `POST .../health` | Test retry on fail | Confirm identity matches expected IG account |
| `CONNECTED_LEGACY` | Connected (legacy) | Manual Page-token path active. Migrate to OAuth recommended. | Migrate connection | Test connection | `GET .../status` (authMethod=Legacy) | Test retry | Legacy delivery; not identical badge to OAuth |
| `MIGRATION_AVAILABLE` | Migration available | OAuth upgrade available; legacy still delivering. | Migrate connection | Dismiss banner | `GET .../status` migrationStatus | N/A | Legacy remains active until cutover |
| `MIGRATION_IN_PROGRESS` | Migrating… | OAuth credential validating; canary may be on. | View progress | Rollback | `GET .../status`, migration endpoints **PAA** | Poll 5s | Do not retire legacy until smoke passes |
| `TOKEN_EXPIRING` | Expiring soon | Token expires on {date} — server provided. | Reauthorize | — | `tokenExpiresAt` from status | N/A | **Never** client-parse token; use server date only |
| `REFRESHING` | Refreshing… | HubChat is refreshing your connection. | — | — | `lastRefreshStatus` polling **PAA** | Auto | Wait; do not start duplicate OAuth |
| `REAUTH_REQUIRED` | Reauthorization required | Connection expired or refresh failed. | Reauthorize | Disconnect | `POST .../reconnect` **PAA** | Reauth retry | Messaging may fail until reauthorized |
| `PERMISSION_MISSING` | Permission missing | Required Meta permissions not granted. | Reauthorize | View permissions | Capability probe **PAA** | After Meta re-approve | Check missing capability checklist |
| `ACCOUNT_MISMATCH` | Account mismatch | Connected account does not match selection. | Choose account / Reauthorize | Disconnect | Account binding API **PAA** | Re-select account | Verify correct IG professional account |
| `REVOKED` | Revoked | Meta access was revoked. | Reauthorize | Disconnect | Status + error code | Reauth | Reconnect via Meta; check Business Settings |
| `PROVIDER_UNAVAILABLE` | Meta unavailable | Meta APIs temporarily unavailable. | Retry | — | Health with 503 mapping | Exponential backoff UI 30s–5m | Try again later; not a HubChat config issue |
| `DISCONNECTING` | Disconnecting… | Removing Instagram connection. | — | — | `POST .../disconnect` **PAA** | N/A | Wait for completion |
| `DISCONNECTED` | Disconnected | Instagram is not connected. | Connect Instagram | — | `GET .../status` | N/A | Inbound/outbound stopped for IG |
| `TEST_FAILED` | Test failed | Connection exists but health check failed. | Retry test | Reauthorize | `POST .../health` | Manual retry | Read failed checks list; not generic ERROR only |
| `CONFIGURATION_ERROR` | Configuration error | HubChat Instagram setup incomplete. | Contact support | — | `safeErrorCode=CONFIGURATION_ERROR` | Support-guided | Includes supportReferenceId; no stack trace |

---

## Visual distinction: OAuth vs Legacy

| Element | OAuth (`CONNECTED`) | Legacy (`CONNECTED_LEGACY`) |
|---------|---------------------|----------------------------|
| Badge color/class | `ig-connect-status-oauth` | `ig-connect-status-legacy` |
| Auth method chip | OAuth | Legacy |
| Primary identity | @instagram_username | @username or account label |
| Page association | Hidden or secondary | "Linked Facebook Page — legacy only" |
| Migration banner | Hidden when complete | Shown when `MIGRATION_AVAILABLE` |
| Manual token fields | Collapsed / hidden | Visible under Advanced |

---

## Connection card fields by state

Always show when connected (OAuth or Legacy):

- Connection status badge
- Instagram username / display name
- Professional account ID (masked, e.g. `···4567`)
- Auth method chip
- Capabilities: Messaging, Comments, Profile (from server)
- Credential health summary
- Last successful test timestamp
- `tokenExpiresAt` when server provides (OAuth path)
- `lastRefreshStatus` when OAuth **PAA**
- Migration status when applicable
- Delivery path: `OAuth` | `Legacy` | `Environment fallback` (sanitized)

Actions availability:

| Action | Typical states |
|--------|----------------|
| Connect Instagram | NOT_CONNECTED, DISCONNECTED |
| Test connection | CONNECTED, CONNECTED_LEGACY, TEST_FAILED, MIGRATION_IN_PROGRESS |
| Reauthorize | TOKEN_EXPIRING, REAUTH_REQUIRED, REVOKED, PERMISSION_MISSING |
| Migrate connection | CONNECTED_LEGACY, MIGRATION_AVAILABLE |
| View permissions | PERMISSION_MISSING, CONNECTED |
| Disconnect | Most connected states |
| Retry | TEST_FAILED, PROVIDER_UNAVAILABLE, CALLBACK_PROCESSING (stuck) |
| Rollback | MIGRATION_IN_PROGRESS |

---

## Mapping from current Channel Settings

| Current (IG-AUTH-0B) | Target state |
|----------------------|--------------|
| `NOT_CONFIGURED` | `NOT_CONNECTED` |
| `DISABLED` | `DISCONNECTED` (channel disabled flag separate) |
| `READY` (manual) | `CONNECTED_LEGACY` — **not** `CONNECTED` |
| `READY` (OAuth) | `CONNECTED` |
| `ERROR` (generic) | Map via `safeErrorCode` to specific states |

---

## Frontend state derivation rule

```text
displayState = f(server.status, server.authMethod, server.migrationStatus,
                 server.credentialHealth, server.safeErrorCode)
```

The UI **must not** override server state based on local clocks for expiry — use `TOKEN_EXPIRING` only when server sets it.
