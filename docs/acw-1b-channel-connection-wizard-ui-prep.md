# ACW-1B — Assisted Channel Connection Wizard UI Shell

**Status:** Wired to ACW-1A (#201) — PR #200
**Branch:** `feature/acw-1b-channel-connection-wizard-ui`  
**Location:** `/dashboard/channel-settings` (wizard section above advanced manual cards)

---

## Data sources

| Priority | Source | Notes |
|----------|--------|-------|
| **Primary** | `GET /api/channel-connections/setup-status` | ACW-1A #201 |
| **Fallback** | `GET /api/channel-settings` mapped per channel | Only when setup-status unavailable |

Save/test still use existing `PATCH /api/channel-settings/[channel]` and `POST .../test-connection`.

---

## API fields consumed

Per `data[]` item:

- `channel`, `setupStatus`, `connectionLabel`, `credentialsPresent`
- `testConnectionAvailable`, `webhookCallbackUrl`, `missingSetupSteps`
- `safeLastError`, `lastVerifiedAt`, `enabled`
- `activeConnectionScope` (scope only — `maskedProviderIdentity` never rendered as label)

---

## Role behavior

- **ADMIN:** wizard on Channel Settings
- **MANAGER / SALES:** access denied (Channel Settings remains ADMIN-only)

---

## Guardrails

No token, secret, PSID, profile URL, raw provider ID, or `maskedProviderIdentity` in wizard views.
