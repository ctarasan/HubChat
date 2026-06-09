# ACW-1B — Assisted Channel Connection Wizard UI Shell

**Status:** Draft PR until ACW-1A API is finalized  
**Branch:** `feature/acw-1b-channel-connection-wizard-ui`  
**Location:** `/dashboard/channel-settings` (wizard section above advanced manual cards)

---

## Purpose

Guided setup shell for LINE, Facebook, and Instagram with independent cards, stepper panels, data-scope messaging, and safe status display.

## Data sources

| Phase | Source | Notes |
|-------|--------|-------|
| Interim (this PR) | `GET /api/channel-settings` mapped per channel | Test/save use existing PATCH + test-connection |
| ACW-1A | `GET /api/channel-connection-wizard` (proposed) | `buildWizardCardsFromAcwApi` adapter ready |

## API fields consumed (ACW-1A proposal)

Per channel: `setupStatus`, `connectionLabel`, `missingSteps`, `lastStatusText`, `webhookUrl`, `supportsTestConnection`, `supportsWizardSave`

## UI behavior

- Three independent setup cards (LINE / Facebook / Instagram)
- Status: Not connected / Ready / Needs attention / Disconnected
- Safe connection label only (never raw Page ID)
- Guided panel: prerequisites, credential source, webhook copy, write-only secret inputs, save/test
- Data-scope banner: active-only inbox/leads default; ADMIN/MANAGER history filter; no auto-delete

## Role behavior

- **ADMIN:** full wizard on Channel Settings page
- **MANAGER / SALES:** existing access denied (unchanged)

## Guardrails

No token, secret, PSID, profile URL, or raw provider ID labels in wizard views.
