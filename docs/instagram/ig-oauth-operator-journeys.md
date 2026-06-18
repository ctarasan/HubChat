# Instagram OAuth — Operator Journeys (IG-AUTH-1B)

Design-only operator workflows. **Current implementation:** manual Channel Settings (IG-AUTH-0B). **Target:** OAuth-assisted connect with legacy migration.

Reference pattern: `FacebookConnectCard.tsx` + `/api/channel-connect/facebook/*`.

---

## Journey map overview

```text
                    ┌─────────────┐
     New tenant ──► │NOT_CONNECTED│
                    └──────┬──────┘
                           │ Connect Instagram
                    ┌──────▼──────┐
                    │ CONNECTING  │──► Meta OAuth
                    └──────┬──────┘
                           │ callback
                    ┌──────▼──────────────┐
                    │ CALLBACK_PROCESSING │
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         CONNECTED    PERMISSION_   ACCOUNT_
                      MISSING       MISMATCH
```

---

## 1. New tenant — no Instagram

| Step | Operator action | UI state | Expected outcome |
|------|-----------------|----------|------------------|
| 1 | Open Channel Settings → Instagram | `NOT_CONNECTED` | Card shows Connect Instagram; no manual fields in primary view |
| 2 | Read consent copy (scopes summary) | `CONNECTING` (pre-redirect) | Understands Messaging + Comments capabilities |
| 3 | Click Connect Instagram | Redirect to Meta | OAuth state created server-side |
| 4 | Approve on Meta | `CALLBACK_PROCESSING` | Callback tab; URL cleaned |
| 5 | Confirm IG account identity | `CONNECTED` (pending test) | Username + masked ID shown |
| 6 | Auto or manual Test connection | `CONNECTED` | Health checks pass; badge Ready |
| 7 | — | — | DM path unblocked for tenant |

**API dependency:** `POST .../oauth/start`, callback handler, `GET .../status`, `POST .../health` — `PENDING_AGENT_A_ARCHITECTURE` for exact routes.

---

## 2. Existing tenant — Facebook Page-token (legacy) path

| Step | Operator action | UI state | Expected outcome |
|------|-----------------|----------|------------------|
| 1 | Open Instagram card | `CONNECTED_LEGACY` | Badge distinct from OAuth; authMethod=Legacy |
| 2 | See migration banner | `MIGRATION_AVAILABLE` | "Migrate to OAuth" without disabling legacy |
| 3 | Review current delivery path | — | Shows Legacy + last test result |
| 4 | Optional: continue using legacy | `CONNECTED_LEGACY` | No forced migration |

**Identity label:** Show **Linked Facebook Page — legacy connection only** if Page ID displayed; never as primary IG identity.

---

## 3. OAuth connect success

| Step | UI | Notes |
|------|-----|-------|
| Callback completes | `CALLBACK_PROCESSING` → account picker if multi-account | `PENDING_AGENT_A_ARCHITECTURE` — single vs multi IG account |
| Identity confirmed | `CONNECTED` | Capabilities summary populated from server |
| Health run | Test checks: messaging, comment reply, profile | Same checks as production smoke |
| Ready | `CONNECTED` + deliveryPath=OAuth | Credential source visible |

---

## 4. User denies permission on Meta

| Step | UI state | Error code |
|------|----------|------------|
| Return from Meta deny | `NOT_CONNECTED` or `PERMISSION_MISSING` | `AUTHORIZATION_DENIED` |
| Operator guidance | Retry Connect; link to permission doc | Non-retryable until user re-approves on Meta |

---

## 5. Wrong Instagram account selected

| Step | UI state | Error code |
|------|----------|------------|
| Account picker confirms wrong IG | `ACCOUNT_MISMATCH` | `ACCOUNT_MISMATCH` |
| Action | Choose different account or Disconnect partial session | Retryable |

---

## 6. Account already connected to another tenant

| Step | UI state | Error code |
|------|----------|------------|
| Server detects duplicate binding | `ACCOUNT_MISMATCH` | `ACCOUNT_ALREADY_CONNECTED` |
| Action | Contact support with `supportReferenceId` | Not retryable without admin unlink |

---

## 7. Required permission missing

| Step | UI state | Error code |
|------|----------|------------|
| Health/capability probe fails scope | `PERMISSION_MISSING` | `PERMISSION_MISSING` |
| UI | Checklist of missing capabilities | Reauthorize primary action |

---

## 8. Token nearing expiry

| Step | UI state | Notes |
|------|----------|-------|
| Server sets expiry threshold | `TOKEN_EXPIRING` | **Server-derived** `tokenExpiresAt`; frontend never parses token |
| Banner | Countdown or date | Reauthorize before expiry |
| No client-side JWT decode | — | Forbidden by design |

---

## 9. Refresh fails

| Step | UI state | Error code |
|------|----------|------------|
| Background refresh job fails | `REAUTH_REQUIRED` | `REFRESH_FAILED` |
| UI | Explain manual reauth needed | Reauthorize primary |

`PENDING_AGENT_A_ARCHITECTURE`: refresh schedule and lazy vs scheduled refresh.

---

## 10. Token revoked

| Step | UI state | Error code |
|------|----------|------------|
| Provider returns revoked | `REVOKED` | `TOKEN_REVOKED` |
| Outbound may fail | Banner + reconnect | Reauthorize |

---

## 11. Disconnect

| Step | Operator action | UI state |
|------|-----------------|----------|
| 1 | Click Disconnect | Confirmation modal |
| 2 | Confirm | `DISCONNECTING` |
| 3 | Server revokes + clears OAuth binding | `DISCONNECTED` |
| 4 | — | Legacy manual fields **not** auto-deleted unless operator opts in |

**Confirmation copy:** See § Confirmation copy below.

---

## 12. Rollback to legacy during canary

| Step | UI state | Notes |
|------|----------|-------|
| Migration in canary | `MIGRATION_IN_PROGRESS` | Shows OAuth + legacy paths |
| Operator clicks Rollback | Confirmation | Restores legacy delivery path |
| Post-rollback | `CONNECTED_LEGACY` | OAuth credential disabled, not deleted until retire step |
| Monitoring | Banner: "Rollback active — OAuth cutover paused" | |

---

## Migration journey (legacy → OAuth)

```text
CONNECTED_LEGACY
  → MIGRATION_AVAILABLE (banner)
  → operator: Start migration [confirm]
  → MIGRATION_IN_PROGRESS
      → OAuth connect (may reuse journey 3)
      → capability test on OAuth credential
      → canary enabled (feature flag — PENDING_AGENT_A_ARCHITECTURE)
      → operator: Confirm cutover [confirm]
      → CONNECTED (OAuth primary; legacy fallback blocked for this connection)
      → monitoring window (24–72h — PENDING_AGENT_A_ARCHITECTURE)
      → operator: Retire legacy credential [confirm]
      → legacy credential disabled; migration complete
```

**Failure at any step:** Working legacy credential **must remain**; show `CONFIGURATION_ERROR` or `CONNECTION_TEST_FAILED` with rollback available.

---

## OAuth start/callback UX rules

### Redirect flow

```text
ADMIN clicks Connect Instagram
→ in-app consent panel (capabilities, data use, no token mention)
→ POST oauth/start → receive redirectUrl
→ window.location to Meta
→ Meta redirects to HubChat callback URL
→ CALLBACK_PROCESSING page (spinner + "Completing connection…")
→ server exchanges code (idempotent)
→ strip ?code=&state= from browser URL
→ poll GET status until terminal state
→ account confirmation or error
```

### Frontend must NOT

| Prohibited | Rationale |
|------------|-----------|
| Store `code` in localStorage/sessionStorage | Secret-equivalent |
| Persist OAuth `state` in localStorage without TTL | CSRF/session fixation risk |
| `console.log` callback query | Leak risk |
| Render raw Meta error JSON | Provider detail leak |
| Display access/refresh token | Core security rule |
| Client-initiated token exchange retry loops | Must be server-idempotent |

### Redirect recovery

| Scenario | UX behavior |
|----------|-------------|
| User refreshes callback page | Poll status by `oauthSessionId` (server session); idempotent complete |
| User closes callback tab | Parent Channel Settings polls status; show "Resume connection" if session pending |
| Back button after success | Strip query params; show CONNECTED from status API |
| Duplicate callback hit | Server returns same result; UI shows success once (`oauthCallbackHandled` ref pattern from Facebook) |

---

## Confirmation copy (operator-facing)

### Start migration

> **Migrate Instagram to OAuth?**
>
> Your current **legacy** connection will keep working until you confirm cutover. HubChat will connect a new OAuth credential and run capability tests before switching delivery.
>
> [Cancel] [Start migration]

### Cutover

> **Switch Instagram delivery to OAuth?**
>
> After cutover, HubChat will use the OAuth credential for messaging and comments. Legacy fallback will be **disabled** for this connection. You can roll back during the monitoring window.
>
> [Cancel] [Confirm cutover]

### Rollback

> **Roll back to legacy Instagram connection?**
>
> HubChat will resume using your legacy credential. The OAuth connection will be paused but not deleted.
>
> [Cancel] [Roll back]

### Disconnect

> **Disconnect Instagram?**
>
> Inbound messages and outbound replies will stop for this account. This does not revoke access on Meta — use Meta Business Settings to remove the app if needed.
>
> [Cancel] [Disconnect]

### Retire legacy credential

> **Retire legacy Instagram credential?**
>
> This removes the manual token from HubChat. Ensure OAuth delivery has been stable during the monitoring window.
>
> [Cancel] [Retire legacy credential]

---

## Role note

Current policy: **ADMIN-only** for all actions (IG-AUTH-0B). MANAGER read-only health is a **future decision** — not in scope for initial OAuth launch.
