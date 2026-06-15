# Agent Report — FB-OAUTH-1D Facebook OAuth Connection Wizard UI Discovery & Implementation Spec

## Metadata

| Field | Value |
|---|---|
| Agent | B (Frontend / UX / UI tests / operator documentation) |
| Date | 2026-06-15 (initial); **2026-06-15 reconciled** with Agent A contract |
| Phase | FB-OAUTH-1D — UI/UX discovery and implementation specification (**docs/spec only; no runtime code**) |
| Branch | `docs/fb-oauth-1d-ui-discovery-spec` |
| Reconciled against | `docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md` (`origin/docs/fb-oauth-1a-discovery-contract`, commit `06057d1`) |
| Related | CCP-0 (`docs/ccp-0-channel-connect-wizard-ux-spec.md` — future dedicated wizard route only) |
| Base commit | `4f97167` (master at spec authoring time) |

---

## Executive summary

HubChat today connects Facebook through **manual Channel Settings** at `/dashboard/channel-settings`. There is **no** OAuth UI in `src/ui/`. Facebook, LINE, and Instagram share one card template in `ChannelSettingsPage.tsx`; secrets are write-only with SET/EMPTY badges; Test connection and READY/ERROR status already work.

**Phase 1 implementation plan (reconciled):** Add Facebook OAuth connect and reconnect as an **incremental section inside the existing Facebook card** on `/dashboard/channel-settings`. Do **not** introduce `/dashboard/channel-connect` in Phase 1. That route remains a **possible future** dedicated Assisted Channel Connection Wizard surface per CCP-0.

**This PR:** documentation only. No endpoints wired, no mock production behavior, no backend/migration/package changes.

**Internal testing:** App Role users can exercise OAuth before Meta App Review. External customer self-serve onboarding remains out of scope.

---

## Reconciliation summary (Agent A contract)

| Topic | Agent A contract (`06057d1`) | Phase 1 UI decision (this spec) |
|---|---|---|
| **Route** | CCP-0 references `/dashboard/channel-connect` | **Phase 1:** `/dashboard/channel-settings` only |
| **OAuth API base** | `/api/channel-connect/facebook/...` | **Agreed** — UI calls these endpoints from Channel Settings |
| **Callback** | Server receives Meta `code` + `state`; exchanges server-side | **Agreed** |
| **Post-callback redirect** | Agent A §8.3 draft used `/dashboard/channel-connect?...` | **Reconciled:** `/dashboard/channel-settings?channel=facebook&oauth=success\|error` |
| **Session resume** | Agent A §8.3 draft used `transactionId` query | **Reconciled:** HttpOnly cookie binds transaction; UI calls session endpoint; **no `code`, `state`, or token in URL** |
| **Page list** | `GET .../pages` — token-free `pageId`, `name`, `tasks` | **Agreed** |
| **Completion** | `POST .../complete` → `status: CONNECTED` initially | **Agreed**; UI does **not** show CONNECTED until health/test readiness (§2.3) |
| **Manual fallback** | `PATCH /api/channel-settings/facebook` + test-connection preserved | **Agreed** — same card, expandable advanced section |
| **Polling** | Agent A §8.4 named “Poll transaction status” | **Reconciled:** one session fetch after callback; explicit Reload/health refresh; **no polling by default** |
| **ADMIN gate** | All OAuth routes ADMIN-only | **Agreed** — reuse Channel Settings gating |

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

**Future only:** `/dashboard/channel-connect` is defined in `docs/ccp-0-channel-connect-wizard-ux-spec.md`. No `app/dashboard/channel-connect/` directory exists. **Not part of Phase 1.**

### 1.2 Facebook card components

There is **no** dedicated `FacebookCard` component. All three channels render from one loop in `ChannelSettingsPage.tsx` (lines 464–690). Phase 1 extracts or embeds a **`FacebookConnectCard`** (or equivalent section) **within** this page for the Facebook channel only.

Facebook-specific identifiers today:

- Card: `data-testid="channel-settings-card-facebook"`
- Status badge: `data-testid="channel-status-facebook"`
- Test connection: `data-testid="channel-test-connection-facebook"`
- Provider Page ID: `data-testid="channel-provider-page-id-facebook"`
- Account label: `data-testid="channel-provider-account-name-facebook"`

### 1.3 Current form fields (Facebook)

From `CHANNEL_SECRET_FIELDS` and `metaProviderFieldLabels` (`channelSettingsModel.ts`):

| UI label | Draft / PATCH key | Input test id |
|---|---|---|
| Enabled | `enabled` | in card |
| Facebook Page ID | `providerPageId` | `channel-provider-page-id-facebook` |
| Account label | `providerAccountName` | `channel-provider-account-name-facebook` |
| Page access token | `page_access_token` → `accessToken` | `secret-input-page_access_token` |
| App secret | `app_secret` → `appSecret` | `secret-input-app_secret` |
| Verify token | `verify_token` → `verifyToken` | `secret-input-verify_token` |

### 1.4 Secret SET / EMPTY behavior

- API returns `secretState` with `EMPTY` | `SET` per field — never raw values.
- UI badges: `secret-state-{patchKey}`; password inputs always blank.
- **Clear stored secret:** confirmation dialog → clear on save.

### 1.5 Test connection action

- `POST /api/channel-settings/facebook/test-connection` via `testConnectionPath("FACEBOOK")`.
- Feedback: `data-testid="channel-test-feedback-facebook"`.

### 1.6 READY / error rendering (manual path)

`ChannelSettingStatus`: `NOT_CONFIGURED` | `DISABLED` | `READY` | `ERROR` — independent of OAuth presentation states (§2).

### 1.7 Manual setup flow (today)

Save → PATCH → Test connection → Reload. No OAuth.

### 1.8 Responsive / mobile behavior

`channel-settings-grid` with `auto-fit minmax(300px, 1fr)`; `@media (max-width: 980px)` rail-on-top layout.

### 1.9 Tests covering the page today

| File | Coverage |
|---|---|
| `src/ui/channelSettingsPage.test.ts` | ADMIN-only, secrets, test-connection, no polling |
| `src/ui/channelSettingsModel.test.ts` | PATCH, feedback, paths |
| `tests/e2e/channel-settings-smoke.spec.ts` | ADMIN, mocked Facebook test connection |
| `tests/e2e/dashboard-sales-smoke.spec.ts` | SALES denied |

### 1.10 LINE and Instagram

Same card template. **Phase 1 OAuth UI must not alter LINE or Instagram cards.**

### 1.11 OAuth-related UI today

**None** in `src/ui/`. Backend lifecycle in `src/lib/channelConnectionLifecycle.ts` has no dashboard consumer yet.

---

## 2. Proposed Facebook OAuth UI state model

### 2.1 Presentation states vs database enum

The eight values below are **UI presentation states only**. They are **not** the `channel_connection_status` database enum and **must not** be persisted by the frontend.

The UI derives presentation state from Agent A status payload fields:

| Backend field | Source | Role in derivation |
|---|---|---|
| `connectionStatus` | `GET .../status` → `data.status` | `DRAFT`, `AUTHORIZING`, `CONNECTED`, … `READY`, `ERROR`, `RECONNECT_REQUIRED`, `REVOKED` |
| `oauthStage` | `GET .../oauth/session` → `data.status` | `PENDING`, `CALLBACK_RECEIVED`, `PAGES_READY`, `COMPLETED`, `FAILED`, `EXPIRED` |
| `healthStatus` | `POST .../health` or status aggregate | `READY`, `ERROR`, `RECONNECT_REQUIRED` |
| `reconnectRequired` | Derived: `connectionStatus === "RECONNECT_REQUIRED"` or `healthStatus === "RECONNECT_REQUIRED"` | Boolean gate for reconnect banner |
| `errorCategory` | Session/status `errorCategory` | Safe operator messaging |
| `manualConfigured` | `GET .../status` → `manualFallbackAvailable` + existing `channel_settings` configured | `MANUAL_CONFIGURED` |

**Helper:** `deriveFacebookConnectPresentationState(input)` in `facebookConnectModel.ts`.

### 2.2 State reference table

| Presentation state | Status label | Operator explanation | Primary action | Secondary action | Allowed | Disabled | Safe error |
|---|---|---|---|---|---|---|---|
| **NOT_CONNECTED** | Not connected | No OAuth-linked Page. Connect with Meta or use manual setup below. | **Connect Facebook** | Expand manual setup | Connect, manual fields when expanded | Page selector, reconnect | — |
| **MANUAL_CONFIGURED** | Manual setup | Credentials saved via manual path. OAuth recommended for easier reconnect. | **Connect Facebook** | Test connection (existing) | Connect, Save, Test connection | OAuth confirm until started | Settings `lastError` if ERROR |
| **CONNECTING** | Connecting… | Redirecting to Meta, or validating connection after Page confirm. | *(spinner)* | **Cancel** (pre-redirect / page select only) | Cancel where applicable | Connect, confirm, reconnect | Mapped `errorCategory` |
| **AWAITING_PAGE_SELECTION** | Select a Page | Meta sign-in succeeded. Choose which Page to connect. | **Confirm Page** | **Cancel** | Page radio, confirm | Connect, manual save | `no_pages`, `page_not_allowed` |
| **CONNECTED** | Connected | Page linked and **runtime readiness confirmed** (health or Test connection success). | **Test connection** (existing) | **Reconnect** | Test connection, reconnect, manual | — | `lastError` sanitized |
| **DEGRADED** | Needs attention | Page linked but verification incomplete (webhook/smoke pending). | **Run health check** | **Reconnect** | Health check, reconnect | — | Per-step safe errors |
| **NEEDS_RECONNECT** | Reconnect required | Authorization expired or revoked. | **Reconnect Facebook** | Manual setup (expanded) | Reconnect, manual | Page confirm until OAuth done | `session_expired`, token revoked copy |
| **ERROR** | Connection error | OAuth or health failed. Manual path may still work. | **Try again** | Expand manual setup | Retry, manual | Confirm until retried | `errorCategory` → operator string |

### 2.3 Credential activation rules (critical)

The UI **must not** show **CONNECTED** merely because the OAuth callback succeeded.

| Step | Presentation state |
|---|---|
| Meta redirects to `oauth=success` | **AWAITING_PAGE_SELECTION** (after one session fetch) |
| Operator confirms Page → `POST .../complete` returns | **CONNECTING** (validating) |
| `POST .../health` returns `ok: true` and `status: READY`, **or** existing **Test connection** returns `READY` on manual/OAuth-bridged settings | **CONNECTED** |
| `complete` succeeded but health/smoke incomplete | **DEGRADED** |
| `healthStatus` or `connectionStatus` is `RECONNECT_REQUIRED` | **NEEDS_RECONNECT** |
| `oauthStage` is `FAILED` / `EXPIRED` or `errorCategory` set | **ERROR** |

OAuth callback success means **page selection is next**, not that the channel is operational.

### 2.4 Derivation matrix

| Presentation state | Typical signals |
|---|---|
| NOT_CONNECTED | No `connectionId`; `connectionStatus` absent / `DRAFT` / `REVOKED`; `oauthStage` idle; not `manualConfigured` |
| MANUAL_CONFIGURED | `manualFallbackAvailable` + Channel Settings configured; no OAuth `CONNECTED`+ progress |
| CONNECTING | Local redirect in flight; **or** `oauthStage` `PENDING`; **or** post-`complete` validation in flight |
| AWAITING_PAGE_SELECTION | `oauth=success` handled; `oauthStage` `CALLBACK_RECEIVED` or `PAGES_READY`; `pagesReady: true` |
| CONNECTED | `connectionStatus` `READY` (or health `READY` + test-connection `READY` per §2.3) |
| DEGRADED | `connectionStatus` between `CONNECTED` and `OUTBOUND_VERIFIED`; `healthStatus` not `READY` |
| NEEDS_RECONNECT | `reconnectRequired` true |
| ERROR | `connectionStatus` `ERROR`; or `oauthStage` `FAILED`/`EXPIRED`; or `errorCategory` without recovery path |

### 2.5 Status chip CSS

New scoped prefix only:

- `.channel-settings-facebook-connect-status-{state}` in `app/globals.css`
- Reuse color tokens from `.channel-settings-status-READY` / `-ERROR`

---

## 3. Connect Facebook flow (Phase 1 — `/dashboard/channel-settings`)

### 3.1 Entry point

**Single integration surface:** Facebook card on `/dashboard/channel-settings`.

- **Connect Facebook** button: `data-testid="facebook-connect-start"`
- Optional deep-link: `/dashboard/channel-settings?channel=facebook` scrolls/focuses Facebook card (no new route)

### 3.2 Connect button behavior

1. ADMIN clicks **Connect Facebook**.
2. UI → local **CONNECTING**; disable duplicate clicks.
3. `POST /api/channel-connect/facebook/oauth/start` with `{ reconnect?: false }` and Bearer + `x-tenant-id`.
4. Response: `{ data: { transactionId, authorizeUrl, expiresAt } }` — **UI uses `authorizeUrl` only**; does not store `transactionId` in `localStorage`/`sessionStorage` (HttpOnly cookie set by server on start or callback — see §3.4).
5. `window.location.assign(authorizeUrl)`.

### 3.3 Callback handling (reconciled)

```text
Meta → GET /api/channel-connect/facebook/oauth/callback?code=...&state=...
         ↓ server validates state, exchanges code server-side (never exposed to UI)
         ↓ server sets HttpOnly OAuth session cookie
         ↓ HTTP 302
Browser → /dashboard/channel-settings?channel=facebook&oauth=success
       or /dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=<safe_enum>
```

**UI rules:**

| Rule | Implementation |
|---|---|
| UI never receives `code` or `state` | Callback hits API route only |
| UI never receives access token | No token fields in any API response |
| After redirect with `oauth=success` | One `GET /api/channel-connect/facebook/oauth/session` (cookie-authenticated) |
| After redirect with `oauth=error` | Map `errorCategory` query → safe banner; still strip query |
| Strip query params | `history.replaceState` removes `oauth`, `errorCategory`, `channel` when done |
| Resume on refresh | Same session endpoint via HttpOnly cookie within `expiresAt` |

### 3.4 HttpOnly session cookie

- **Assumption (reconciled with Agent A security §5):** Server sets an HttpOnly, Secure, SameSite=Lax cookie binding the OAuth transaction to the ADMIN session.
- UI calls `GET /api/channel-connect/facebook/oauth/session` **without** passing `transactionId` in query or body.
- Tests mock the session API; cookie presence represented by successful session response in E2E.

### 3.5 Expired / invalid session

- Session returns `oauthStage: EXPIRED` or `FAILED` → **ERROR** with *"Authorization session expired. Start again."*
- Do not render Page list from stale client cache.

### 3.6 Cancel / retry

- **Cancel** before redirect: clear local busy state.
- **Cancel** during page selection: abandon flow; return to **NOT_CONNECTED** or **MANUAL_CONFIGURED**.
- **Try again** / **Reconnect**: `POST .../oauth/start` or `POST .../reconnect`.

### 3.7 Polling

- **No polling by default** (consistent with `channelSettingsPage.test.ts` — existing page has no polling).
- **One** session fetch immediately after `oauth=success` redirect.
- **Explicit refresh:** existing **Reload** button refetches `GET .../status` and Channel Settings list.
- **After complete:** single `POST .../health` (or operator clicks **Test connection**).

---

## 4. Page selector

Shown when presentation state is **AWAITING_PAGE_SELECTION**.

### 4.1 Token-free Page options (Agent A §8.5)

`GET /api/channel-connect/facebook/pages` returns:

```typescript
type FacebookPageOption = {
  pageId: string;
  name: string;
  tasks: string[];       // e.g. MESSAGING
  alreadyConnected: boolean;
};
```

| Field | Rendered | Never rendered |
|---|---|---|
| Page name | Yes | — |
| Page ID | Yes | — |
| Tasks / permissions summary | Yes (humanized) | Raw Graph payloads |
| Eligibility / warning | Yes when Page not selectable | — |
| Access token / credential reference | **Never** | — |

### 4.2 Interaction

- Single-select radio: `data-testid="facebook-page-selector"`
- **Confirm Page** → `POST /api/channel-connect/facebook/complete` with `{ pageId }` only (transaction bound by cookie)
- Empty list: safe empty state + manual setup expander
- Inaccessible Page: disabled row + hint from `tasks` / eligibility flag
- Replace existing Page: confirmation modal `data-testid="facebook-page-replace-confirm"` when `alreadyConnected` or status shows different `providerPageId`

---

## 5. Reconnect flow

### 5.1 Banner

`FacebookReconnectBanner.tsx` inside Facebook card when **NEEDS_RECONNECT** or **DEGRADED** with `reconnectRequired`:

- `data-testid="facebook-reconnect-banner"`
- **Reconnect Facebook** → `POST /api/channel-connect/facebook/reconnect` then same OAuth redirect flow

### 5.2 Keep existing connection usable

- Show last known `providerPageName` / `providerPageId` from `GET .../status` while reconnect pending.
- Badge *"Reconnect in progress…"* during **CONNECTING**.
- Do not show **NOT_CONNECTED** while server still reports an active connection.

### 5.3 No duplicate cards

- Single Facebook card per tenant; OAuth section augments existing card — no second Facebook panel.

---

## 6. Security and privacy UX constraints

| Rule | Phase 1 implementation |
|---|---|
| No `code` / `state` in URL displayed | Strip immediately; never render |
| No token in URL, localStorage, sessionStorage | Session via HttpOnly cookie + API |
| No token in client logs | Enum/boolean logs only |
| No token in HTML | No OAuth token inputs; manual token fields remain write-only password inputs |
| Sanitized errors only | Map `errorCategory` via `sanitizeProviderError` contract; reuse `FORBIDDEN_LEAK_PATTERNS` from `channelSettingsModel.ts` |
| Page ID / name | May display |
| App Secret | Manual section only; never in OAuth UI |

---

## 7. Manual fallback (required — same card)

### 7.1 Placement

Manual setup **stays on the Facebook card** in an expandable **Advanced / manual setup** section (`data-testid="facebook-manual-setup"`):

- Default collapsed when OAuth-first flow is active
- Expanded by default when **MANUAL_CONFIGURED** and OAuth not started
- Contains **existing** fields: Enabled, Page ID, account label, three secrets, Save, Test connection

### 7.2 Copy

> **Advanced / manual setup**
> Enter Page ID and tokens directly. Values are write-only — HubChat never shows saved secrets. Use when OAuth is unavailable.

### 7.3 No regression

Unchanged behavior for:

- SET/EMPTY badges, clear-on-save, Save, Test connection
- `PATCH /api/channel-settings/facebook`
- `POST /api/channel-settings/facebook/test-connection`
- Secret inputs never prefilled

**Do not** move, duplicate, or prefill stored secret values in the OAuth section.

---

## 8. Proposed component and file plan (implementation phase — not this PR)

### 8.1 New files

| File | Responsibility |
|---|---|
| `src/ui/facebookConnectModel.ts` | Presentation state derivation, API path helpers, `errorCategory` map, OAuth query strip |
| `src/ui/FacebookConnectCard.tsx` | OAuth connect section: status chip, Connect/Reconnect, page selector host |
| `src/ui/FacebookPageSelector.tsx` | Token-free page list, confirm, replace modal |
| `src/ui/FacebookReconnectBanner.tsx` | Reconnect CTA |
| `src/ui/facebookConnectModel.test.ts` | Derivation matrix, query strip, error map |
| `app/globals.css` | `.channel-settings-facebook-connect-*` block |

### 8.2 Existing files to change (minimal)

| File | Change |
|---|---|
| `src/ui/ChannelSettingsPage.tsx` | Render `FacebookConnectCard` for `channel === "FACEBOOK"`; handle `?channel=facebook&oauth=*` on mount; wire existing Reload |
| `src/ui/channelSettingsPage.test.ts` | OAuth markers, query strip, ADMIN gate, LINE/IG unchanged |
| `tests/e2e/channel-settings-smoke.spec.ts` | Extend with mocked OAuth flow on existing route |

**Not in Phase 1:**

| Removed from prior draft | Reason |
|---|---|
| `app/dashboard/channel-connect/page.tsx` | Future CCP-0 only |
| `src/ui/ChannelConnectPage.tsx` | Replaced by incremental Channel Settings integration |
| `src/ui/dashboardAppRailModel.ts` new nav item | Stay on existing Channels → Channel Settings |
| `tests/e2e/channel-connect-facebook-oauth.spec.ts` | Use extended `channel-settings-smoke` instead |

**Explicitly untouched:** `src/infrastructure/**`, `app/api/**` (except future Agent A work), `supabase/migrations/**`, `src/worker/**`, LINE/Instagram card bodies.

### 8.3 Data flow (Channel Settings integration)

```text
ChannelSettingsPage
  ├─ on mount: read ?channel=facebook&oauth=success|error
  ├─ if oauth=success: one GET .../oauth/session (HttpOnly cookie)
  ├─ deriveFacebookConnectPresentationState(status, session, health)
  ├─ FacebookConnectCard
  │    ├─ FacebookReconnectBanner (if NEEDS_RECONNECT)
  │    ├─ FacebookPageSelector (if AWAITING_PAGE_SELECTION)
  │    └─ link to expand facebook-manual-setup
  └─ existing manual fields (unchanged PATCH/test-connection path)
```

### 8.4 Callback route UI

**No** `app/dashboard/.../oauth/callback/page.tsx`. Server callback is API-only; UI lands on Channel Settings with query hints, then strips them.

---

## 9. Test plan (implementation phase)

### 9.1 Unit (`facebookConnectModel.test.ts`)

- Derivation matrix: all eight presentation states from `connectionStatus` + `oauthStage` + `healthStatus` + `reconnectRequired` + `errorCategory`
- **Callback success → AWAITING_PAGE_SELECTION**, not CONNECTED
- **Complete → CONNECTING** until health READY
- `stripFacebookOAuthQueryParams` removes `oauth`, `errorCategory`, `code`, `state`
- `mapFacebookOAuthErrorCategory` never returns raw Graph text

### 9.2 Page tests (`channelSettingsPage.test.ts`)

- Integration point remains `ChannelSettingsPage.tsx` / `/dashboard/channel-settings`
- ADMIN sees `facebook-connect-start`
- Non-ADMIN: existing `channel-settings-access-denied` unchanged
- `oauth=success` triggers one session fetch mock
- `oauth=error&errorCategory=access_denied` → safe banner
- HttpOnly session resume via session API mock (no `transactionId` in URL)
- Query stripped via `replaceState`
- LINE / Instagram cards: no `facebook-connect-start`

### 9.3 E2E (extend `tests/e2e/channel-settings-smoke.spec.ts`)

| Scenario | Assertion |
|---|---|
| ADMIN Connect Facebook | Button visible on Facebook card only |
| Non-ADMIN denied | Unchanged sales smoke |
| Connect redirect | Mock `oauth/start` → navigate to `authorizeUrl` |
| Callback success | Land on `channel-settings?oauth=success`; mock session → page selector |
| Callback error | `oauth=error&errorCategory=...`; safe banner; no `code`/`state` in DOM |
| Page selector | Select → mock `complete` → validating state → mock `health` → CONNECTED |
| Reconnect | Banner + `reconnect` mock |
| Manual fallback | Advanced section: Save/Test connection/SET/EMPTY unchanged |
| No token in DOM/storage | No `EAA`, `access_token=`, `code=`, `state=` in HTML; `localStorage`/`sessionStorage` empty of OAuth keys |
| Mobile 390px | OAuth section wraps; manual fields usable |
| LINE / Instagram unchanged | No OAuth controls |
| Regression | Full `channel-settings-smoke.spec.ts` + `npm test` pass |

### 9.4 Regression gate

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test tests/e2e/channel-settings-smoke.spec.ts
```

---

## 10. Coordination contract — agreed values and open questions

### 10.1 Agreed API surface (Agent A §4, §8)

| Endpoint | Method | UI use |
|---|---|---|
| `/api/channel-connect/facebook/status` | `GET` | Initial + Reload |
| `/api/channel-connect/facebook/oauth/start` | `POST` | Connect; body `{ reconnect?: boolean }` |
| `/api/channel-connect/facebook/oauth/callback` | `GET` | **Browser/server only** — UI never calls |
| `/api/channel-connect/facebook/oauth/session` | `GET` | Once after `oauth=success`; cookie-auth |
| `/api/channel-connect/facebook/pages` | `GET` | Page selector |
| `/api/channel-connect/facebook/complete` | `POST` | `{ pageId }` — transaction via cookie |
| `/api/channel-connect/facebook/reconnect` | `POST` | Reconnect banner |
| `/api/channel-connect/facebook/health` | `POST` | Post-complete validation |
| `/api/channel-settings/facebook` | `PATCH` | Manual fallback (unchanged) |
| `/api/channel-settings/facebook/test-connection` | `POST` | Manual + CONNECTED readiness (unchanged) |

### 10.2 Agreed response shapes (token-free)

**Status** (`GET .../status`):

```typescript
{
  data: {
    connectionId: string | null;
    status: ChannelConnectionStatus;
    providerPageId: string | null;
    providerPageName: string | null;
    webhookActive: boolean;
    lastHealthCheckAt: string | null;
    lastVerifiedAt: string | null;
    lastError: string | null;
    credentialState: { pageAccessToken: "EMPTY" | "SET" | "EXPIRED" | "REVOKED" };
    manualFallbackAvailable: true;
    oauthAvailable: boolean;
  };
}
```

**OAuth start:** `{ data: { transactionId, authorizeUrl, expiresAt } }` — UI navigates to `authorizeUrl` only.

**Session:** `{ data: { transactionId, status: OAuthTransactionStatus, errorCategory, message, expiresAt, pagesReady } }`.

**Pages:** `{ data: { pages: FacebookPageOption[] } }`.

**Complete:** `{ data: { connectionId, status: "CONNECTED", providerPageId, providerPageName, message } }`.

**Health:** `{ data: { ok, status: "READY" | "ERROR" | "RECONNECT_REQUIRED", message, ... } }`.

### 10.3 Agreed `errorCategory` values (operator mapping)

| `errorCategory` | Operator message |
|---|---|
| `access_denied` | Meta sign-in was cancelled or denied. |
| `session_expired` | Authorization session expired. Start again. |
| `no_pages` | No manageable Pages found for this account. |
| `page_not_allowed` | Selected Page is missing required permissions. |
| `token_exchange_failed` | Could not complete connection. Try again or use manual setup. |
| `tenant_forbidden` | Not authorized for this tenant. |
| `rate_limited` | Too many attempts. Wait a moment and try again. |
| `state_mismatch` | Connection request was invalid. Start again. |

### 10.4 Agreed callback / session behavior (Phase 1)

| Step | Owner |
|---|---|
| Meta sends `code` + `state` to API callback | Backend |
| Code exchange server-side | Backend |
| HttpOnly cookie set | Backend |
| Redirect to `/dashboard/channel-settings?channel=facebook&oauth=success\|error` | Backend |
| One session fetch | UI |
| `history.replaceState` strip | UI |
| Page list / complete / health | UI + Backend |

### 10.5 Remaining unresolved questions (genuine)

| # | Question | Owner |
|---|---|---|
| 1 | **HttpOnly cookie name** and whether `oauth/start` or callback sets it | Agent A |
| 2 | **`oauthStage` on `GET .../status`** — should UI poll status only, or is session endpoint sufficient after callback? | Agent A |
| 3 | **Page eligibility** — does `FacebookPageOption` include `selectable: false` + `reasonCode`, or infer from `tasks` only? | Agent A |
| 4 | **`HUBCHAT_FACEBOOK_OAUTH_ENABLED`** — hide Connect button when false? | Agent A / ops |
| 5 | **Bridge write to `channel_settings`** on OAuth complete (FB-OAUTH-1B) — does UI show one READY or two status badges during transition? | Agent A |
| 6 | **Agent A §8.3 redirect** still documents `/dashboard/channel-connect` — confirm backend adopts `/dashboard/channel-settings` redirect for Phase 1 | Agent A |
| 7 | **`complete` request** — confirm `transactionId` omitted from body when cookie bound (UI assumption) | Agent A |
| 8 | **DEGRADED** checklist UI — does health response expose per-step flags, or single `message` only? | Agent A |

---

## Acceptance checklist (this PR)

- [x] Findings cite actual UI files and tests
- [x] Endpoints from Agent A contract presented as agreed; Phase 1 redirect reconciled
- [x] No runtime code change
- [x] No backend/API/migration/package change
- [x] Manual fallback remains on same card (§7)
- [x] UI never receives or displays stored Page Access Token (§6)
- [x] Reconciled against Agent A `06057d1`
- [x] Phase 1 uses `/dashboard/channel-settings` only; `/dashboard/channel-connect` marked future

---

## References

| Document | Path |
|---|---|
| Agent A OAuth contract | `docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md` |
| CCP-0 wizard UX (future route) | `docs/ccp-0-channel-connect-wizard-ux-spec.md` |
| Channel Settings page | `src/ui/ChannelSettingsPage.tsx` |
| Channel Settings model | `src/ui/channelSettingsModel.ts` |
| Connection lifecycle | `src/lib/channelConnectionLifecycle.ts` |
