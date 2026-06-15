# Agent Report — FB-OAUTH-1D Facebook OAuth Connection Wizard UI Discovery & Implementation Spec

## Metadata

| Field | Value |
|---|---|
| Agent | B (Frontend / UX / UI tests / operator documentation) |
| Date | 2026-06-15 |
| Phase | FB-OAUTH-1D — UI/UX discovery and implementation specification (**docs/spec only; no runtime code**) |
| Branch | `docs/fb-oauth-1d-ui-discovery-spec` |
| Related | CCP-0 (`docs/ccp-0-channel-connect-wizard-ux-spec.md`), Agent A contract (`docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md` on branch `docs/fb-oauth-1a-discovery-contract`) |
| Base commit | `4f97167` (master at spec authoring time) |

---

## Executive summary

HubChat today connects Facebook through **manual Channel Settings** at `/dashboard/channel-settings`. There is **no** Assisted Channel Connection Wizard route (`/dashboard/channel-connect`) and **no** OAuth UI in `src/ui/`. Facebook, LINE, and Instagram share one card template in `ChannelSettingsPage.tsx`; secrets are write-only with SET/EMPTY badges; Test connection and READY/ERROR status already work.

This spec defines how to add **Facebook OAuth connect and reconnect** inside the **Assisted Channel Connection Wizard** surface (CCP-0 target route), while preserving the existing manual fallback on Channel Settings with zero regression.

**This PR:** documentation only. No endpoints wired, no mock production behavior, no backend/migration/package changes.

**Internal testing:** App Role users can exercise OAuth before Meta App Review. External customer self-serve onboarding remains out of scope for this phase.

---

## 1. Current Facebook connection UX (repository facts)

### 1.1 Route and page ownership

| Item | Path |
|---|---|
| Next.js route | `app/dashboard/channel-settings/page.tsx` (lines 1–5) |
| Page component | `src/ui/ChannelSettingsPage.tsx` (default export, ~697 lines) |
| Model / API helpers | `src/ui/channelSettingsModel.ts` |
| Styles | `app/globals.css` (`.channel-settings-*`, lines ~3412–3710; mobile `@media (max-width: 980px)` lines ~2970–3018) |
| Nav entry | `src/ui/dashboardAppRailModel.ts` — `href: "/dashboard/channel-settings"`, label "Channels", **ADMIN only** via `canViewChannelsNav` |

**Assisted wizard route:** `/dashboard/channel-connect` is defined in `docs/ccp-0-channel-connect-wizard-ux-spec.md` only. No `app/dashboard/channel-connect/` directory exists.

### 1.2 Facebook card components

There is **no** dedicated `FacebookCard` component. All three channels render from one loop:

```464:490:src/ui/ChannelSettingsPage.tsx
            <div className="channel-settings-grid" aria-label="Channel settings by provider">
              {CHANNEL_SETTING_ORDER.map((channel) => {
                const row = channels.find((c) => c.channel === channel);
                // ...
                return (
                  <article
                    key={channel}
                    className="card channel-settings-card"
                    data-testid={`channel-settings-card-${channelPathParam(channel)}`}
                  >
```

Facebook-specific identifiers:

- Card: `data-testid="channel-settings-card-facebook"`
- Status badge: `data-testid="channel-status-facebook"`
- Test connection: `data-testid="channel-test-connection-facebook"`
- Provider Page ID input: `data-testid="channel-provider-page-id-facebook"`
- Account label: `data-testid="channel-provider-account-name-facebook"`

Channel order: `["LINE", "FACEBOOK", "INSTAGRAM"]` (`channelSettingsModel.ts` lines 1–3).

### 1.3 Current form fields (Facebook)

From `CHANNEL_SECRET_FIELDS` and `metaProviderFieldLabels` (`channelSettingsModel.ts`):

| UI label | Draft / PATCH key | Input test id |
|---|---|---|
| Enabled (checkbox) | `enabled` | in card |
| Facebook Page ID | `providerPageId` | `channel-provider-page-id-facebook` |
| Account label | `providerAccountName` | `channel-provider-account-name-facebook` |
| Page access token | `page_access_token` → `accessToken` | `secret-input-page_access_token` |
| App secret | `app_secret` → `appSecret` | `secret-input-app_secret` |
| Verify token | `verify_token` → `verifyToken` | `secret-input-verify_token` |

Read-only meta rows (`<dl className="channel-settings-meta">`): Configured, Last verified, Updated, Last error.

### 1.4 Secret SET / EMPTY behavior

- API returns `secretState` with `EMPTY` | `SET` per field — never raw values (`channelSettingsModel.ts` types lines 7–16, helpers lines 275–283).
- UI badges: `secret-state-{patchKey}` (e.g. `secret-state-page_access_token`).
- CSS: `.channel-settings-secret-state-set` (green) vs `.channel-settings-secret-state-empty` (muted) in `globals.css`.
- Password inputs always blank; placeholder: *"Leave blank to keep existing secret"*.
- **Clear stored secret:** confirmation dialog → marks clear on save → *"Clear on save"* hint; typing cancels pending clear.

Header copy (`ChannelSettingsPage.tsx` lines 422–424):

> *"Provider secrets are write-only and are never shown after save. Use status and SET/EMPTY badges to see what is stored."*

### 1.5 Test connection action

- Button: `"Test connection"` / `"Testing…"` — `testConnection(channel)` (`ChannelSettingsPage.tsx` lines 308–366).
- API: `POST /api/channel-settings/facebook/test-connection` via `testConnectionPath("FACEBOOK")` (`channelSettingsModel.ts`).
- ADMIN-only at UI and API (`requireAuth(req, ["ADMIN"])` on route).
- Feedback via `buildTestConnectionFeedback` → `card success|error channel-settings-test-feedback` with `data-testid="channel-test-feedback-facebook"`.

### 1.6 READY / error rendering

Status enum (`channelSettingsModel.ts` line 5):

`NOT_CONFIGURED` | `DISABLED` | `READY` | `ERROR`

| Status | Badge label | Health hint | CSS |
|---|---|---|---|
| `NOT_CONFIGURED` | Not configured | Add required secrets… | muted |
| `DISABLED` | Disabled | Channel is disabled… | muted |
| `READY` | Ready | *(none)* | green success |
| `ERROR` | Error | Provider connection needs attention… | red danger |

Last error row: `channel-last-error-facebook` with class `channel-settings-meta-error` when `row.lastError` is set.

### 1.7 Manual setup flow (today)

1. ADMIN opens `/dashboard/channel-settings`.
2. `GET /api/channel-settings` loads all three channel rows.
3. On Facebook card: toggle Enabled → enter Page ID / account label → paste secrets (blank = keep) → **Save Facebook** → `PATCH /api/channel-settings/facebook`.
4. **Test connection** updates status and feedback in place.
5. **Reload** refetches; local secret drafts cleared after successful save.

No OAuth redirect, no stepper, no webhook auto-config in UI.

### 1.8 Responsive / mobile behavior

- Desktop: `channel-settings-root` grid `64px rail | main`; cards in `channel-settings-grid` with `repeat(auto-fit, minmax(300px, 1fr))`.
- `@media (max-width: 980px)`: rail moves to horizontal top row; main scrolls below (same pattern as team-members, ops).
- Card internals use `flex-wrap: wrap` on badges, secret rows, and actions — no mobile-only Facebook sheet.

### 1.9 Tests covering the page today

| File | Coverage |
|---|---|
| `src/ui/channelSettingsPage.test.ts` | ADMIN-only, fetch/PATCH/test-connection, secret drafts, SET/EMPTY badges, clear confirmation, Facebook provider metadata test ids, no polling |
| `src/ui/channelSettingsModel.test.ts` | PATCH body, feedback variants, test connection path, secret state |
| `src/interfaces/api/channelSettings.route.test.ts` | GET/PATCH ADMIN gate |
| `src/interfaces/api/channelSettingsTestConnection.test.ts` | test-connection lifecycle, no secret leakage |
| `tests/e2e/channel-settings-smoke.spec.ts` | ADMIN access, mocked Facebook test connection, providerPageId PATCH, secret omission |
| `tests/e2e/launch-readiness-smoke.spec.ts` | ADMIN channel settings smoke |
| `tests/e2e/dashboard-sales-smoke.spec.ts` | SALES cannot access channel settings |

### 1.10 LINE and Instagram (unchanged baseline)

Same files and card template. LINE has no provider metadata fields. Instagram mirrors Facebook Page ID + account label pattern with different secret patch keys (`access_token` vs `page_access_token`). **FB-OAUTH-1D must not alter LINE or Instagram card behavior on Channel Settings.**

### 1.11 OAuth-related UI today

**None** in `src/ui/` or `app/dashboard/`. Backend lifecycle states exist in `src/lib/channelConnectionLifecycle.ts` (`AUTHORIZING`, `CONNECTED`, `READY`, `RECONNECT_REQUIRED`, …) with no dashboard consumer.

---

## 2. Proposed Facebook OAuth UI state model

These are **operator-visible display states** for the Facebook card inside the Assisted Channel Connection Wizard (`/dashboard/channel-connect`). They map to backend `channel_connections.status` and OAuth transaction substates — **mapping is provisional** until Agent A contract is merged (see §10).

### State reference table

| Display state | Status label (EN) | Operator explanation | Primary action | Secondary action | Allowed controls | Disabled controls | Safe error presentation |
|---|---|---|---|---|---|---|---|
| **NOT_CONNECTED** | Not connected | No Facebook Page is linked. Connect with Meta to receive Messenger and comment webhooks. | **Connect Facebook** | Open manual setup (link) | Connect button, manual link | Page selector, reconnect, disconnect | N/A |
| **MANUAL_CONFIGURED** | Manual setup | Facebook credentials were entered in Channel Settings. OAuth connect is optional but recommended for easier reconnect. | **Connect Facebook** (upgrade) | **Open Channel Settings** | Connect, manual link, Test connection (on Settings page) | OAuth page selector until connect started | Show Settings `lastError` if ERROR; never show token |
| **CONNECTING** | Connecting… | Redirecting to Meta sign-in. Complete authorization in the popup or new tab. | *(spinner — no click)* | **Cancel** | Cancel (aborts transaction) | Connect, page selector, reconnect | *"Connection was cancelled."* or sanitized Meta denial message |
| **AWAITING_PAGE_SELECTION** | Select a Page | Choose which Facebook Page to connect. Only Pages you manage are listed. | **Confirm Page** | **Cancel** / **Try again** | Radio/select one Page, confirm | Connect (until selection made) | *"No Pages available. Check Meta permissions or use manual setup."* |
| **CONNECTED** | Connected | Page is linked. Run health check to confirm webhooks and messaging. | **Run health check** | **Reconnect** (if degraded) | Health check, view Page name/ID | Page selector (unless reconnecting) | Sanitized `last_error_message_safe` in meta row |
| **DEGRADED** | Needs attention | Connection works partially (e.g. webhook unverified, outbound smoke pending). Inbox may be limited. | **Run health check** | **View details** (expand checklist) | Health check, reconnect | Disconnect without confirm | Checklist items with per-step safe errors |
| **NEEDS_RECONNECT** | Reconnect required | Meta authorization expired or was revoked. Reconnect to restore messaging. | **Reconnect Facebook** | **Open manual setup** | Reconnect, manual link | Page selector until OAuth completes | *"Authorization expired. Reconnect to continue."* + optional `last_error_code` label |
| **ERROR** | Connection error | Last connect or health check failed. Existing manual credentials may still work if configured. | **Try again** | **Open manual setup** | Retry, manual link | Confirm Page until retried | Single line sanitized error; no Graph JSON, no token |

### Backend mapping (provisional — confirm with Agent A)

| UI display state | Likely backend signals |
|---|---|
| NOT_CONNECTED | No `channel_connections` row, or `DRAFT` / `REVOKED` |
| MANUAL_CONFIGURED | `channel_settings` configured (`configured: true`) but no OAuth `channel_connections` or status below `CONNECTED` |
| CONNECTING | OAuth transaction `AUTHORIZING` or connection status `AUTHORIZING` |
| AWAITING_PAGE_SELECTION | Transaction `PAGES_PENDING` (Agent A proposed name) |
| CONNECTED | `CONNECTED` … `OUTBOUND_VERIFIED` (not yet `READY`) |
| DEGRADED | `READY` with failed smoke / `last_health_check_at` stale / partial verification flags |
| NEEDS_RECONNECT | `RECONNECT_REQUIRED` |
| ERROR | `ERROR` with `last_error_message_safe` |

### Status chip styling (reuse existing tokens)

Extend `globals.css` with wizard-scoped classes mirroring Channel Settings:

- `.channel-connect-status-not-connected` — muted
- `.channel-connect-status-connecting` — info + spinner
- `.channel-connect-status-connected` / `.channel-connect-status-ready` — success (reuse `.channel-settings-status-READY` colors)
- `.channel-connect-status-degraded` / `.channel-connect-status-needs-reconnect` — warn
- `.channel-connect-status-error` — danger (reuse `.channel-settings-status-ERROR`)

---

## 3. Connect Facebook flow (UX design)

### 3.1 Entry points

1. **Primary:** Facebook card on `/dashboard/channel-connect` — **Connect Facebook** button (`data-testid="facebook-connect-start"`).
2. **Secondary:** Link from Channel Settings Facebook card header: *"Use assisted connect"* → `/dashboard/channel-connect?channel=facebook` (deep-link opens Facebook detail panel).
3. **Upgrade path:** `MANUAL_CONFIGURED` state shows both Connect and manual link.

### 3.2 Connect button behavior

1. ADMIN clicks **Connect Facebook**.
2. UI sets local state `CONNECTING`; disables duplicate clicks.
3. UI calls **`POST /api/channel-connect/facebook/oauth/start`** *(Agent A — not finalized)* with Bearer + `x-tenant-id`.
4. On success: response contains `redirectUrl` only (no token). UI performs `window.location.assign(redirectUrl)` — full-page redirect preferred over popup (popup blockers, mobile Safari).
5. On failure: return to `ERROR` or prior state; show sanitized message in `role="alert"` banner.

**Loading:** Card shows spinner + *"Redirecting to Meta…"*; rail and other channel cards remain usable.

### 3.3 Callback success / error handling

Agent A proposes browser callback at:

`GET /api/channel-connect/facebook/oauth/callback` (server-side; Meta redirects here)

**UI assumption (requires confirmation):** After callback, server redirects to:

`/dashboard/channel-connect?channel=facebook&oauth=success`

or

`/dashboard/channel-connect?channel=facebook&oauth=error&code=<safe_code>`

**UI rules:**

- Never read `access_token`, `code`, or `state` from URL query params for display or storage.
- On `oauth=success`: fetch `GET /api/channel-connect/facebook/oauth/session` or `GET .../status`; transition to `AWAITING_PAGE_SELECTION` or `CONNECTED` based on response.
- On `oauth=error`: show mapped safe message from `error_code` enum only (see §10).
- Strip OAuth query params via `history.replaceState` after handling (Back should not replay callback).

### 3.4 Expired or invalid OAuth session

- If session endpoint returns `expired` / `not_found`: show *"Your authorization session expired. Start again."* with **Connect Facebook** primary.
- Do not partially render Page list from stale client state.
- **Refresh behavior:** On mount, always refetch status/session; resume `AWAITING_PAGE_SELECTION` if server says transaction is still valid.

### 3.5 Cancel / retry

- **Cancel** during `CONNECTING` (before redirect): clear local busy state only.
- **Cancel** during `AWAITING_PAGE_SELECTION`: call optional `POST .../oauth/cancel` *(Agent A TBD)* or abandon transaction server-side on timeout; return to `NOT_CONNECTED` or `MANUAL_CONFIGURED`.
- **Try again** from `ERROR` / `NEEDS_RECONNECT`: same as Connect Facebook (new `oauth/start`).

### 3.6 Manual token fallback preservation

OAuth connect **does not** remove or hide Channel Settings. Operators can always open `/dashboard/channel-settings` for manual Page ID + token entry. Wizard copy:

> *"Manual setup remains available under Channel Settings. Tokens are write-only and never displayed after save."*

---

## 4. Page selector (UX design)

Shown when display state is `AWAITING_PAGE_SELECTION`.

### 4.1 Data shown per Page row

| Field | Shown | Notes |
|---|---|---|
| Page name | Yes | From Graph `name` |
| Page ID | Yes | Numeric ID — not a secret |
| Tasks / permissions summary | Yes | Human-readable list, e.g. `MESSAGING`, `PAGES_SHOW_LIST` — from Agent A `tasks[]` or equivalent |
| Page access token | **Never** | Not in list, confirm screen, logs, or HTML |
| Profile picture URL | Optional | HTTPS only; fail-open hide on error |

### 4.2 Selection interaction

- **Single selection** — radio group or selectable card list (`role="radiogroup"`, `data-testid="facebook-page-selector"`).
- **Confirm Page** disabled until one row selected.
- **Empty state:** *"No Facebook Pages found for this Meta account. Confirm you have Page admin access, or use manual setup."* + link to Channel Settings.
- **Multiple Pages:** scrollable list; no multi-select.

### 4.3 Inaccessible Page warning

If API marks a Page `selectable: false` with `reason_code` (e.g. missing `pages_messaging`):

- Row visible but disabled with hint: *"Missing required permission: Messaging"*.
- Do not show raw Graph error.

### 4.4 Replace existing connection confirmation

When `status` API reports an existing connected Page and user selects a **different** Page:

Modal (`data-testid="facebook-page-replace-confirm"`):

> **Replace connected Page?**
>
> This will disconnect **{currentPageName}** ({currentPageId}) and connect **{newPageName}** ({newPageId}). Inbox routing for the previous Page may stop until webhooks are verified.
>
> [Cancel] [Replace Page]

Requires explicit confirm before `POST .../complete`.

### 4.5 Completion

On confirm: `POST /api/channel-connect/facebook/complete` with `{ pageId }` only — no token in request body from UI.

Success → `CONNECTED` or `DEGRADED` based on health flags; show success toast + optional smoke checklist (CCP-0 §2).

---

## 5. Reconnect flow (UX design)

### 5.1 Reconnect warning banner

When `NEEDS_RECONNECT` or `DEGRADED` with token expiry:

```html
<div class="card channel-connect-reconnect-banner" data-testid="facebook-reconnect-banner" role="alert">
  <strong>Reconnect required</strong>
  <p>Facebook authorization expired. Messages may not send until you reconnect.</p>
  <button type="button" data-testid="facebook-reconnect-start">Reconnect Facebook</button>
</div>
```

### 5.2 Reconnect action

Same flow as Connect Facebook (`POST .../reconnect` or `oauth/start` with `intent: "reconnect"` — **Agent A TBD**).

### 5.3 Keep existing connection usable while reconnect pending

- **Safe:** Show last known Page name/ID from status API; Inbox continues using last good credentials until server marks `REVOKED` (Agent A defines cutover).
- **UI:** Badge *"Reconnect in progress…"*; disable **Disconnect** and second reconnect click.
- **Unsafe — do not:** Hide existing Page info or show NOT_CONNECTED while old connection still active server-side.

### 5.4 Replacement confirmation

Same modal as §4.4 when reconnect would swap Page ID.

### 5.5 Failure recovery

- Reconnect error → `ERROR` with sanitized message; **Try again** + manual setup link.
- Do not create a second Facebook card or duplicate connection rows in UI — always single Facebook panel bound to `tenant_id + provider=FACEBOOK`.

### 5.6 Avoid tenant confusion

- All API calls use existing `fetchWithTenantHeaders` + `x-tenant-id` from session (same as Channel Settings).
- Display `tenantId` only in diagnostics if already shown elsewhere — never in operator-facing copy.

---

## 6. Security and privacy UX constraints

| Rule | Implementation |
|---|---|
| No token in URL displayed | Strip OAuth params; never render `access_token`, `code`, `state` query values |
| No token in localStorage / sessionStorage | OAuth resume via server session endpoint only |
| No token in client logs | `console.log` forbidden for connect payloads; tests grep for token patterns |
| No token in rendered HTML | No `value=` on token fields; wizard has no token inputs |
| Sanitized provider errors only | Map `error_code` → operator string; reuse `FORBIDDEN_LEAK_PATTERNS` from `channelSettingsModel.ts` (lines 58–63) |
| Page ID / name may display | Numeric Page ID and display name in selector and meta |
| App Secret never in wizard UI | App secret remains Channel Settings only (or server env) |
| ADMIN only | Same gate as Channel Settings: `me.role === "ADMIN"` + API `requireAuth(..., ["ADMIN"])` |
| CSRF | Browser callback handled server-side; UI never posts `code` to API from client |

---

## 7. Manual fallback (required)

### 7.1 Placement

| Surface | Manual fallback role |
|---|---|
| **Channel Connect wizard** | Secondary link: *"Manual setup (advanced)"* → `/dashboard/channel-settings#facebook` |
| **Channel Settings** | **Unchanged** primary manual surface — full form, save, test connection |

### 7.2 Copy (wizard)

> **Manual setup (advanced)**
> Enter Page ID and access token directly. Tokens are write-only — HubChat never shows saved values. Use for recovery if OAuth is unavailable.

### 7.3 No regression requirements

Existing behavior must remain identical on Channel Settings:

- SET/EMPTY badges and clear-on-save flow
- `PATCH /api/channel-settings/facebook` body shape
- `POST .../test-connection` feedback variants
- Secret inputs never prefilled (`channelSettingsPage.test.ts` asserts this)

### 7.4 MANUAL_CONFIGURED wizard state

When `GET .../status` reports manual credentials present but no OAuth connection:

- Show **Connect Facebook** as primary upgrade path.
- Show **Open Channel Settings** as secondary.
- Do not duplicate secret inputs on wizard card.

---

## 8. Proposed component and file plan (implementation phase — not this PR)

### 8.1 New files (likely)

| File | Ownership |
|---|---|
| `app/dashboard/channel-connect/page.tsx` | Route shell → imports wizard page |
| `src/ui/ChannelConnectPage.tsx` | Wizard page layout, channel grid, detail panel |
| `src/ui/channelConnectModel.ts` | Status types, API path helpers, error mapping, OAuth query strip |
| `src/ui/facebookConnectModel.ts` | Facebook-specific state machine, page selector types |
| `src/ui/FacebookConnectCard.tsx` | Facebook wizard card (extracted from loop) |
| `src/ui/FacebookPageSelector.tsx` | Page list + confirm + replace modal |
| `src/ui/FacebookReconnectBanner.tsx` | Reconnect CTA banner |
| `app/globals.css` | `.channel-connect-*` scoped styles (new block after `.channel-settings-*`) |
| `src/ui/channelConnectModel.test.ts` | Model unit tests |
| `src/ui/channelConnectPage.test.ts` | Page structure / ADMIN gate tests |
| `tests/e2e/channel-connect-facebook-oauth.spec.ts` | E2E with mocked OAuth APIs |

### 8.2 Existing files likely to change (minimal touch)

| File | Change |
|---|---|
| `src/ui/dashboardAppRailModel.ts` | Add `channel-connect` nav item (ADMIN), parallel to Channels |
| `src/ui/ChannelSettingsPage.tsx` | Add *"Use assisted connect"* link on Facebook card header only |
| `src/ui/channelSettingsPage.test.ts` | Assert link presence; assert no OAuth buttons on LINE/IG |
| `docs/ccp-0-channel-connect-wizard-ux-spec.md` | Cross-link FB-OAUTH-1D when implementation starts |

**Explicitly not changed in FB-OAUTH-1D implementation without separate approval:**

- `src/infrastructure/adapters/channels/*`
- `app/api/webhook/*`
- `supabase/migrations/*`
- `src/worker/*`
- LINE / Instagram wizard cards (stub "Coming soon" acceptable until their OAuth phases)

### 8.3 State hooks / data flow

```text
ChannelConnectPage
  ├─ useChannelConnectStatus()     → GET .../facebook/status (on mount + after OAuth return)
  ├─ useFacebookOAuthSession()     → GET .../oauth/session when URL has oauth=success
  ├─ useFacebookPages()            → GET .../pages when AWAITING_PAGE_SELECTION
  └─ mutations:
       startConnect()               → POST .../oauth/start
       completePage(pageId)         → POST .../complete
       reconnect()                  → POST .../reconnect
       runHealthCheck()             → POST .../health
```

No React Query in repo today — follow existing `useState` + `fetchWithTenantHeaders` pattern from `ChannelSettingsPage.tsx`.

### 8.4 Callback route UI

**Preferred:** Server redirect to `/dashboard/channel-connect?channel=facebook&oauth=success` — **no dedicated callback page component**.

**Alternative (if Agent A requires):** `app/dashboard/channel-connect/oauth/callback/page.tsx` — thin loader that immediately refetches session and redirects to main wizard with query params stripped. Still **no token display**.

### 8.5 CSS scope

New BEM-style prefix: `channel-connect-*` to avoid regressing `.channel-settings-*`. Reuse color tokens from `.channel-settings-status-*` for consistency.

---

## 9. Test plan (implementation phase)

### 9.1 Unit tests (`channelConnectModel.test.ts`)

- Map each backend status to display state
- `stripOAuthQueryParams` removes token-bearing params
- `mapFacebookOAuthErrorCode` never returns raw Graph messages
- Page selector validates single selection

### 9.2 Page tests (`channelConnectPage.test.ts`)

- ADMIN sees Connect Facebook on Facebook card
- MANAGER / SALES see access denied (mirror `channel-settings-access-denied` pattern)
- `oauth=success` query triggers session fetch, not token parse
- `oauth=error` shows safe banner
- Manual setup link href points to `/dashboard/channel-settings`
- LINE and Instagram cards unchanged (no `facebook-connect-start` test id)

### 9.3 E2E (`channel-connect-facebook-oauth.spec.ts`)

| Scenario | Assertion |
|---|---|
| ADMIN sees Connect Facebook | Button visible |
| Non-ADMIN | No nav / access denied |
| Connect redirect initiation | Mock `oauth/start` → `redirectUrl`; UI navigates |
| Callback success | Mock session → Page selector visible |
| Callback safe error | `oauth=error&code=access_denied` → banner, no token in DOM |
| Page selector | Select row → Confirm → mock `complete` → Connected state |
| Reconnect | Banner visible on `RECONNECT_REQUIRED`; mock reconnect flow |
| Refresh / resume | Reload during `AWAITING_PAGE_SELECTION` restores list from API |
| Manual fallback | Link opens Channel Settings; Facebook manual form works |
| No token rendering | `page.content()` excludes `EAA` prefix patterns and `access_token=` |
| Mobile responsive | 390px viewport — card stacks, actions wrap |
| LINE / Instagram unchanged | No new OAuth buttons on other cards |
| Channel Settings regression | Existing `channel-settings-smoke.spec.ts` passes unchanged |

### 9.4 Regression gate

Before merge of implementation PR:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test tests/e2e/channel-settings-smoke.spec.ts
```

---

## 10. Coordination contract — assumptions requiring Agent A confirmation

> **Nothing in this section is finalized.** UI will not wire endpoints until Agent A contract is approved and merged.

### 10.1 Endpoint names (proposed by Agent A — pending merge)

| Assumption | Agent A proposal | UI impact |
|---|---|---|
| Status | `GET /api/channel-connect/facebook/status` | Card initial state |
| OAuth start | `POST /api/channel-connect/facebook/oauth/start` | Connect / Reconnect button |
| OAuth callback | `GET /api/channel-connect/facebook/oauth/callback` | Browser redirect only — UI does not call |
| Session poll | `GET /api/channel-connect/facebook/oauth/session` | Resume after callback |
| Page list | `GET /api/channel-connect/facebook/pages` | Page selector |
| Complete | `POST /api/channel-connect/facebook/complete` | Confirm Page |
| Reconnect | `POST /api/channel-connect/facebook/reconnect` | Reconnect banner |
| Health | `POST /api/channel-connect/facebook/health` | Health check CTA |
| Disconnect | `POST /api/channel-connect/facebook/disconnect` | Future — not in 1D UI scope |

### 10.2 Response shapes (TBD)

- `status` response: `{ displayState, page?: { id, name }, connectionStatus, lastError?: { code, messageSafe }, manualConfigured: boolean }`
- `oauth/start` response: `{ redirectUrl: string }` — **no token fields**
- `pages` response: `{ pages: Array<{ id, name, tasks: string[], selectable: boolean, reasonCode?: string }> }`
- `complete` response: `{ connectionStatus, page: { id, name } }`

### 10.3 Callback transport

- **Assumption:** Meta → server callback → HTTP 302 to dashboard with `oauth=success|error` — UI never receives `code`.
- **Confirm:** Exact redirect URLs and allowed `error` code enum.

### 10.4 Page-selection session identifier

- **Assumption:** Server stores OAuth transaction server-side; UI passes no transaction id (cookie or session binding).
- **Alternative:** UI receives opaque `transactionId` in redirect query — must not be confusable with token; strip after use.

### 10.5 Connection status enum

- Backend: full `channel_connection_status` in `src/domain/channelConnections.ts`.
- UI display states (§2) are a **simplified projection** — confirm mapping table with Agent A.

### 10.6 Error categories (proposed safe codes for UI mapping)

| `error_code` | Operator message |
|---|---|
| `access_denied` | Meta sign-in was cancelled or denied. |
| `session_expired` | Authorization session expired. Start again. |
| `no_pages` | No manageable Pages found for this account. |
| `page_not_allowed` | Selected Page is missing required permissions. |
| `token_exchange_failed` | Could not complete connection. Try again or use manual setup. |
| `tenant_forbidden` | Not authorized for this tenant. |
| `rate_limited` | Too many attempts. Wait a moment and try again. |

### 10.7 Polling vs explicit refresh

- **Assumption:** No polling on wizard page (matches Channel Settings — `channelSettingsPage.test.ts` asserts no polling).
- After OAuth redirect: **one-shot** session fetch on mount; operator **Reload** button refetches status (same pattern as Channel Settings reload).
- **Confirm:** Whether `CONNECTING` requires short poll on session endpoint or server always redirects only when ready.

### 10.8 Manual + OAuth bridge

- **Assumption:** During transition, OAuth `complete` mirrors into `channel_settings` for `DB_WITH_ENV_FALLBACK` workers (Agent A §4).
- UI shows `MANUAL_CONFIGURED` when Settings configured but wizard not connected — **confirm** detection fields on status API.

### 10.9 App Review scope

- Internal App Role testing does not change UI — same Connect flow.
- UI copy may add footnote: *"External customer onboarding requires Meta App Review."* — operator doc only.

---

## Acceptance checklist (this PR)

- [x] Findings cite actual UI files and tests
- [x] No speculative endpoint presented as finalized (§10 marked TBD)
- [x] No runtime code change
- [x] No backend/API/migration/package change
- [x] Manual fallback remains in plan (§7)
- [x] UI never receives or displays stored Page Access Token (§6)
- [x] Ready to reconcile against Agent A contract (`docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md`)

---

## References

| Document | Path |
|---|---|
| CCP-0 wizard UX spec | `docs/ccp-0-channel-connect-wizard-ux-spec.md` |
| Agent A OAuth contract (parallel) | `docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md` |
| Channel Settings page | `src/ui/ChannelSettingsPage.tsx` |
| Channel Settings model | `src/ui/channelSettingsModel.ts` |
| Connection lifecycle | `src/lib/channelConnectionLifecycle.ts` |
| CCW data scope audit | `docs/ccw-0-channel-connection-data-scope-audit.md` |
