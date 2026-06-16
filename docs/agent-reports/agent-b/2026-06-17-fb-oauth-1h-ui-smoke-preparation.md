# Agent B Report — FB-OAUTH-1H Facebook OAuth UI / Browser Smoke Preparation

## Metadata

| Field | Value |
|---|---|
| Agent | B |
| Date | 2026-06-17 |
| Phase | FB-OAUTH-1H — UI/browser smoke preparation and evidence pack |
| Branch | `docs/fb-oauth-1h-ui-smoke-evidence-pack` |
| Base | `master` @ `a9e593daeb61ed401e0c910b0c990eae8be62742` |
| Authoritative runbook | [`docs/hubchat-facebook-oauth-staging-pilot-smoke-runbook.md`](../../hubchat-facebook-oauth-staging-pilot-smoke-runbook.md) |
| Worksheet | [`docs/hubchat-facebook-oauth-ui-smoke-worksheet.md`](../../hubchat-facebook-oauth-ui-smoke-worksheet.md) |

---

## Summary

Prepared browser/UI verification package for Facebook OAuth staging smoke. Verified merged UI implementation against contract; added focused unit tests for error categories, health WARN/FAIL gates, callback guards, accessibility hooks, and responsive CSS. **No live OAuth, outbound send, or environment changes.**

**Final verdict: READY FOR BROWSER SMOKE** (pending Agent A FB-OAUTH-1G preflight)

---

## Master SHA

`a9e593daeb61ed401e0c910b0c990eae8be62742` (includes PRs #224, #226, #227, #228)

---

## UI files inspected

| File | Role |
|------|------|
| `app/dashboard/channel-settings/page.tsx` | Route wrapper |
| `src/ui/ChannelSettingsPage.tsx` | Facebook card integration; `facebook-manual-setup` details |
| `src/ui/FacebookConnectCard.tsx` | OAuth orchestration, callback, health, reconnect |
| `src/ui/FacebookPageSelector.tsx` | Page radio list, confirm/cancel |
| `src/ui/FacebookReconnectBanner.tsx` | Reconnect CTA |
| `src/ui/facebookConnectModel.ts` | DTOs, parsers, display-state derivation, fetch client |
| `src/lib/facebookOAuthDisplayState.ts` | Server display-state + redirect URL builder |
| `app/globals.css` | FB-OAUTH-1D card styles + `@media (max-width: 390px)` |

---

## API contracts inspected

| Endpoint | UI usage |
|----------|----------|
| `GET /api/channel-connect/facebook/status` | Mount load; `oauthAvailable`, display state |
| `POST /api/channel-connect/facebook/oauth/start` | Connect → `authorizeUrl` redirect |
| `GET /api/channel-connect/facebook/oauth/session` | Post-callback session resume |
| `GET /api/channel-connect/facebook/pages` | Page picker |
| `POST /api/channel-connect/facebook/complete` | Page confirm → CONNECTING |
| `POST /api/channel-connect/facebook/health` | Run validation → five checks |
| `POST /api/channel-connect/facebook/reconnect` | Reconnect → `authorizeUrl` |

Parsers reject premature `CONNECTED`/`READY` from complete and health responses.

---

## Display-state matrix

| State | Badge | Primary action | Secondary | Disabled | Operator guidance | API expectation | Outbound allowed | Screenshot |
|-------|-------|----------------|-----------|----------|-------------------|-----------------|------------------|------------|
| `NOT_CONNECTED` | Not connected | Connect Facebook | Manual setup | Connect if `!oauthAvailable` | Unavailable hint when flag off | `oauthAvailable`, no connection | No | B-01, C-01 |
| `MANUAL_CONFIGURED` | Manual setup | Connect Facebook | Manual setup | — | OAuth optional alongside manual | `manualConfigured: true` | Manual path only | B-03 |
| `AWAITING_PAGE_SELECTION` | Select a Page | Confirm Page | Cancel | Confirm until selected | Choose pilot Page | `oauthStage` CALLBACK/PAGES_READY | No | C-04, C-05 |
| `CONNECTING` | Connecting… | Run validation | — | While busy | Page linked; validate before Connected | `COMPLETED` + AUTHORIZING or health incomplete | **No** | C-06, D-01 |
| `CONNECTED` | Connected | — | — | — | Ready hint after all PASS | `READY` + `healthStatus: OK` + 5× PASS | **Yes** (worker READY) | D-04 |
| `NEEDS_RECONNECT` | Reconnect required | Reconnect Facebook | Manual setup | While busy | Default: auth expired/revoked | `reconnectRequired` or `RECONNECT_REQUIRED` | No | E-01 |
| `ERROR` | Connection error | Connect Facebook | Manual setup | — | Sanitized banner from `errorCategory` | Failed/expired OAuth | No | C-07 |
| `DEGRADED` | Needs attention | Run validation / reconnect per health | Manual | — | Not used as Connected substitute | `READY` + `DEGRADED` | No until resolved | — |

**Confirmed:** CONNECTED not shown before all five checks PASS; CONNECTING after complete until explicit validation; NEEDS_RECONNECT distinct from ERROR; Page selection required when multiple Pages returned; stale callback guarded (`oauthCallbackHandled` + URL strip + CONNECTED→AWAITING_PAGE_SELECTION downgrade).

---

## READY / five-check UI behavior

| Check | UI test ID | PASS required for Connected |
|-------|------------|----------------------------|
| `CREDENTIAL_RESOLUTION` | `facebook-health-check-CREDENTIAL_RESOLUTION` | Yes |
| `PAGE_ACCESS` | `facebook-health-check-PAGE_ACCESS` | Yes |
| `REQUIRED_TASKS` | `facebook-health-check-REQUIRED_TASKS` | Yes |
| `GRAPH_API` | `facebook-health-check-GRAPH_API` | Yes |
| `RUNTIME_TEST_CONNECTION` | `facebook-health-check-RUNTIME_TEST_CONNECTION` | Yes |

- **Run validation** is explicit (`facebook-run-validation`); no auto-health after complete (verified in tests).
- WARN/FAIL on any check → `allReadinessChecksPass` false → no `facebook-connect-ready`.
- `validationBusy` disables duplicate submission.
- 501 deferred → stays CONNECTING, deferred banner, no health list.
- Premature CONNECTED from health parser → rejected.

---

## oauthAvailable: false result

| Behavior | Verified |
|----------|----------|
| Hint `facebook-oauth-unavailable` with `FACEBOOK_OAUTH_UNAVAILABLE_COPY` | Yes — E2E + model |
| Connect/Reconnect hidden | Yes — `showConnect`/`showReconnect` require `oauthAvailable` |
| Manual setup remains (`facebook-manual-setup`) | Yes |
| 404 / parse failure → `facebook-connect-status-load-error` | Yes — not unavailable copy |
| No automatic retry loop | Yes — single `loadStatus` on mount; no `setInterval` |

---

## Callback query handling

| Query | Behavior |
|-------|----------|
| `?channel=facebook&oauth=success` | Single handle via ref; GET session; strip query immediately; never CONNECTED from session alone |
| `?channel=facebook&oauth=error&errorCategory=...` | Mapped sanitized message; ERROR state; strip query |
| Refresh | `oauthCallbackHandled` prevents re-processing |
| Code/state in URL | Not expected post-server callback; operator verifies URL clean (worksheet H3) |

---

## Reconnect UI result

| Behavior | Verified |
|----------|----------|
| Shown when `NEEDS_RECONNECT` + `oauthAvailable` | Yes |
| `facebook-reconnect-start` loading **Reconnecting…** | Yes |
| Redirect via `authorizeUrl` on success | Yes |
| 501 → deferred banner, stays CONNECTING | Yes — E2E |
| Failed initiation → sanitized error; no credential deletion copy | Yes |
| Linked Page line remains visible during reconnect | Yes — `providerPageName`/`providerPageId` block |

---

## Error-category mapping

All nine categories map to sanitized `FACEBOOK_OAUTH_ERROR_MESSAGES`; lowercase/unknown → `UNKNOWN`. `sanitizeFacebookConnectMessage` blocks token-like leaks in custom messages.

| Category | Actionable copy | Gap |
|----------|-----------------|-----|
| `ACCESS_DENIED` | Meta sign-in cancelled | None |
| `INVALID_OR_EXPIRED_STATE` | Start again | None |
| `SESSION_EXPIRED` | Start again | None |
| `NO_PAGES` | No manageable Pages | None |
| `MISSING_PAGE_TASKS` | Missing permissions; shown on disabled Page row | None |
| `TOKEN_EXCHANGE_FAILED` | Try again or manual | None |
| `PROVIDER_TEMPORARY` | Wait and retry | None |
| `RECONNECT_REQUIRED` | Reconnect required | None |
| `UNKNOWN` | Generic safe message | None |

No raw provider JSON or stack traces rendered in components inspected.

---

## Secret-leak surfaces (plan)

Documented in worksheet: DOM, Network (7 channel-connect endpoints), callback URL, queue/metadata (Section F/H), screenshots. Redaction rules and forbidden field list included. HAR must not be committed to Git.

---

## Responsive / accessibility findings

| Check | Finding |
|-------|---------|
| Viewport ≤390px | Health check grid stacks to single column; action buttons full width (`globals.css`) |
| Page selector | `role="radiogroup"` + `aria-label="Facebook Pages"` |
| Card section | `aria-label="Facebook assisted connection"` |
| Status badges | Text labels (not color-only); distinct CSS per state |
| Focus | Native buttons and radio inputs; no custom trap |
| Long copy | Grid/flex wrap on check rows; banner column layout |
| Thai/English | No hard-coded Thai in OAuth components; error strings English — verify during live smoke if localized banners added later |

**Note:** No blocking layout defects found in static review. Live smoke should confirm Thai operator copy in manual setup hints does not overlap OAuth card.

---

## Automated tests

### Existing coverage confirmed

| File | Coverage |
|------|----------|
| `src/ui/facebookConnectModel.test.ts` | Display state, parsers, five-check gate, deferred 501, oauthAvailable, sanitization, callback strip, card static analysis |
| `src/ui/channelSettingsPage.test.ts` | Facebook-only integration, manual setup wrapper |
| `src/lib/facebookOAuthDisplayState.test.ts` | Server display-state derivation |
| `tests/e2e/channel-settings-smoke.spec.ts` | oauthAvailable false, status 404, health 501, reconnect 501, manual fallback |

### Tests added (FB-OAUTH-1H)

| Test | Purpose |
|------|---------|
| All nine error categories sanitized | Category matrix |
| `allReadinessChecksPass` rejects WARN/FAIL | Five-check gate |
| Session CONNECTED downgrade guard in card | Stale callback |
| `facebook-connect-ready` guard | Connected only after PASS |
| PageSelector radiogroup + confirm disabled | Accessibility |
| ReconnectBanner default copy + busy | Reconnect UI |
| globals.css responsive rules | Layout |

---

## Worksheet summary

Created [`docs/hubchat-facebook-oauth-ui-smoke-worksheet.md`](../../hubchat-facebook-oauth-ui-smoke-worksheet.md) with sections A–J: before enablement, OAuth unavailable, connect flow, health, reconnect, outbound observation, rollback, security, manual/LINE/IG regression, stop conditions, Network plan, screenshot plan.

---

## Blockers

None for documentation/preparation phase.

**Execution blockers (expected):**

- Agent A FB-OAUTH-1G preflight must PASS before live browser smoke (flags, Meta, deploy SHA, worker health).
- Real Meta sign-in requires App Review/dev-mode test users per runbook P16.

---

## Handoff from Agent A (FB-OAUTH-1G)

Agent B requires from Agent A before executing worksheet sections C–F:

1. Staging/pilot deploy SHA (Vercel + Railway)
2. Confirmation `HUBCHAT_FACEBOOK_OAUTH_ENABLED` and `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` on isolated pilot deploy
3. Meta app callback URL registered for staging base
4. Pilot tenant UUID + Page ID
5. ADMIN credentials for operator
6. Worker `/ready` healthy
7. Explicit GO to begin browser smoke (no production broad enablement)

---

## Scope confirmation

- Docs + focused UI tests only
- No runtime/backend/worker/migration changes
- No environment variable changes
- No real OAuth connection performed
- No Facebook outbound send performed
- No secrets in repository

---

## Files changed

| File | Change |
|------|--------|
| `docs/hubchat-facebook-oauth-ui-smoke-worksheet.md` | **New** — operator worksheet |
| `docs/agent-reports/agent-b/2026-06-17-fb-oauth-1h-ui-smoke-preparation.md` | This report |
| `docs/agent-reports/agent-b/latest.md` | Index update |
| `docs/hubchat-smoke-test-inventory.md` | FB-OAUTH-1H entry |
| `src/ui/facebookConnectModel.test.ts` | +8 focused tests |

---

## Prior

FB-OAUTH-1F runbook ([#227](https://github.com/ctarasan/HubChat/pull/227)); FB-OAUTH-1E ([#228](https://github.com/ctarasan/HubChat/pull/228)); FB-OAUTH-1D UI ([#224](https://github.com/ctarasan/HubChat/pull/224)); FB-OAUTH-1C ([#226](https://github.com/ctarasan/HubChat/pull/226)).
