# Agent Report — FB-OAUTH-1D Facebook OAuth Connection Wizard UI Discovery & Implementation Spec

## Metadata

| Field | Value |
|---|---|
| Agent | B (Frontend / UX / UI tests / operator documentation) |
| Date | 2026-06-15 (initial); **2026-06-15 reconciled** with merged Agent A contract |
| Phase | FB-OAUTH-1D — UI/UX discovery and implementation specification (**docs/spec only; no runtime code**) |
| Branch | `docs/fb-oauth-1d-ui-discovery-spec` |
| Reconciled against | **FB-OAUTH-1A** — [`docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md`](../agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md) (merged via [PR #222](https://github.com/ctarasan/HubChat/pull/222)) |
| Related | CCP-0 (`docs/ccp-0-channel-connect-wizard-ux-spec.md` — future dedicated wizard route only) |

---

## Executive summary

HubChat today connects Facebook through **manual Channel Settings** at `/dashboard/channel-settings`. There is **no** OAuth UI in `src/ui/`. Facebook, LINE, and Instagram share one card template in `ChannelSettingsPage.tsx`; secrets are write-only with SET/EMPTY badges; Test connection and READY/ERROR status already work.

**Phase 1 implementation plan (reconciled):** Add Facebook OAuth connect and reconnect as an **incremental section inside the existing Facebook card** on `/dashboard/channel-settings`. Do **not** introduce `/dashboard/channel-connect` in Phase 1. That route remains a **possible future** dedicated Assisted Channel Connection Wizard surface per CCP-0.

**This PR:** documentation only. No endpoints wired, no mock production behavior, no backend/migration/package changes.

**Internal testing:** App Role users can exercise OAuth before Meta App Review. External customer self-serve onboarding remains out of scope.

---

## Reconciliation summary (merged FB-OAUTH-1A — PR #222)

| Topic | Agent A contract (PR #222) | Phase 1 UI decision (this spec) |
|---|---|---|
| **Route** | Phase 1 locked to `/dashboard/channel-settings` | **Agreed** — no `/dashboard/channel-connect` in Phase 1 |
| **OAuth API base** | `/api/channel-connect/facebook/...` (eight endpoints) | **Agreed** — UI calls these from Channel Settings |
| **Callback** | Meta `code` + `state` → backend only; server-side exchange | **Agreed** |
| **Post-callback redirect** | `/dashboard/channel-settings?channel=facebook&oauth=success\|error` | **Agreed** |
| **Session resume** | HttpOnly cookie; one-shot `GET .../oauth/session` | **Agreed** — no `code`, `state`, `transactionId`, or token in URL/storage |
| **Page list** | `GET .../pages` — token-free `pageId`, `name`, `tasks`, `selectable`, `reasonCode` | **Agreed** |
| **Completion** | `POST .../complete` → `connectionStatus: AUTHORIZING`, `displayState: CONNECTING` | **Agreed** — UI **never** shows CONNECTED immediately after complete |
| **Operational readiness** | All **five** readiness-blocking checks `PASS` → `READY` + `OK` + `CONNECTED` | **Agreed** — includes `RUNTIME_TEST_CONNECTION` (always required) |
| **Manual fallback** | `PATCH /api/channel-settings/facebook` + test-connection preserved | **Agreed** — same card, expandable advanced section |
| **Polling** | No background polling | **Agreed** — one session fetch after callback; explicit Reload/health refresh |
| **ADMIN gate** | All OAuth routes ADMIN-only | **Agreed** — reuse Channel Settings gating |
| **Health DTO** | Structured token-free `checks[]` with `PASS` \| `WARN` \| `FAIL` | **Agreed** — UI renders sanitized messages only |
| **errorCategory** | UPPER_SNAKE_CASE closed set (§9) | **Agreed** |

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

`ChannelSettingStatus`: `NOT_CONFIGURED` | `DISABLED` | `READY` | `ERROR` — independent of OAuth **presentation** states (§2). Manual path `READY` is the existing Channel Settings badge; OAuth operational success uses `displayState: CONNECTED` with `connectionStatus: READY` and `healthStatus: OK`.

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

The eight values below are **UI presentation states only** (`displayState`). They are **not** the `channel_connection_status` database enum and **must not** be persisted by the frontend.

**Critical rule:** The UI derives **presentation** from server `displayState` when present, supplemented by `connectionStatus`, `oauthStage`, `healthStatus`, `reconnectRequired`, and `errorCategory`. **Do not** map `healthStatus` alone to presentation — e.g. pre-READY `healthStatus: DEGRADED` with `displayState: CONNECTING` is valid and must render **Connecting**, not **Needs attention**.

| Backend field | Source | Role in derivation |
|---|---|---|
| `displayState` | `GET .../status`, `POST .../complete`, `POST .../health`, `GET .../oauth/session` | **Primary** presentation driver when returned |
| `connectionStatus` | `GET .../status` → persisted `channel_connection_status` enum | `DRAFT`, `AUTHORIZING`, `CONNECTED`, … `READY`, `ERROR`, `RECONNECT_REQUIRED`, `REVOKED` |
| `oauthStage` | `GET .../oauth/session` or status aggregate | `PENDING`, `CALLBACK_RECEIVED`, `PAGES_READY`, `COMPLETED`, `FAILED`, `EXPIRED` |
| `healthStatus` | `POST .../health` or status aggregate | `UNKNOWN`, `OK`, `DEGRADED`, `ERROR`, `RECONNECT_REQUIRED` — **never `READY`** |
| `reconnectRequired` | Status/health DTO | Boolean gate for reconnect banner |
| `errorCategory` | Session/status/health — UPPER_SNAKE_CASE only | Safe operator messaging |
| `checks` | `POST .../health` → `checks[]` | Sanitized per-check messages for validation UI |
| `manualConfigured` | `GET .../status` | `MANUAL_CONFIGURED` presentation |

**Helper:** `deriveFacebookConnectPresentationState(input)` in `facebookConnectModel.ts` — must align with Agent A §6.4; prefer server `displayState` when supplied.

### 2.2 Five readiness-blocking checks (Phase 1 gate)

Phase 1 defines **exactly five** readiness-blocking checks. The UI may show **CONNECTED** only after `POST .../health` returns all five with status **`PASS`**:

| `code` | UI label (suggested) |
|---|---|
| `CREDENTIAL_RESOLUTION` | Stored credential resolved |
| `PAGE_ACCESS` | Page access verified |
| `REQUIRED_TASKS` | Required permissions present |
| `GRAPH_API` | Graph API reachable |
| `RUNTIME_TEST_CONNECTION` | Runtime / Test Connection path verified |

**`RUNTIME_TEST_CONNECTION` rules (locked):**

- Always required and readiness-blocking before first `READY`.
- Never optional or non-blocking in Phase 1.
- When `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` or FB-OAUTH-1B is incomplete: backend returns `FAIL` or blocking `WARN`; UI stays **`CONNECTING`** — must **not** show READY or CONNECTED.

**Phase 1 defines no optional health check codes.** Operational `displayState: DEGRADED` is reserved for **future post-READY** supplemental warnings only. A `WARN` on any of the five Phase 1 required checks **never** produces UI **DEGRADED** before first READY.

### 2.3 Lifecycle mapping (locked — Agent A §2, §6.4, §8.4, §8.6)

| Event | `connectionStatus` | `oauthStage` | `healthStatus` | `displayState` | `reconnectRequired` | UI must show |
|---|---|---|---|---|---|---|
| OAuth callback success | `AUTHORIZING` (typical) | `CALLBACK_RECEIVED` / `PAGES_READY` | `UNKNOWN` | **`AWAITING_PAGE_SELECTION`** | `false` | Page selector — **not** Connected |
| `POST .../complete` success | **`AUTHORIZING`** | **`COMPLETED`** | **`UNKNOWN`** | **`CONNECTING`** | **`false`** | Connecting / validating — **not** Connected |
| Pre-READY: any required check `WARN`/`FAIL` (reconnect not proven) | **`AUTHORIZING`** | `COMPLETED` | `DEGRADED` or `ERROR` (never `OK`) | **`CONNECTING`** | `false` | Connecting + sanitized validation message — **not** Connected, **not** DEGRADED chip |
| Resolver disabled / FB-OAUTH-1B incomplete | **`AUTHORIZING`** | `COMPLETED` | not `OK` | **`CONNECTING`** | `false` | Connecting — `RUNTIME_TEST_CONNECTION` cannot readiness-PASS |
| First operational readiness success (all five `PASS`) | **`READY`** | `COMPLETED` | **`OK`** | **`CONNECTED`** | **`false`** | Connected |
| Reconnect proven | repo lifecycle value (`RECONNECT_REQUIRED`, `REVOKED`, or `ERROR`) | varies | **`RECONNECT_REQUIRED`** | **`NEEDS_RECONNECT`** | **`true`** | Reconnect banner |
| Future post-READY supplemental optional `WARN` | `READY` | — | `DEGRADED` | `DEGRADED` | `false` | **Not Phase 1** |

**Forbidden:** Showing **CONNECTED** immediately after OAuth callback or `POST .../complete`.

### 2.4 State reference table

| Presentation state | Status label | Operator explanation | Primary action | Secondary action | Allowed | Disabled | Safe error |
|---|---|---|---|---|---|---|---|
| **NOT_CONNECTED** | Not connected | No OAuth-linked Page. Connect with Meta or use manual setup below. | **Connect Facebook** | Expand manual setup | Connect, manual fields when expanded | Page selector, reconnect | — |
| **MANUAL_CONFIGURED** | Manual setup | Credentials saved via manual path. OAuth recommended for easier reconnect. | **Connect Facebook** | Test connection (existing) | Connect, Save, Test connection | OAuth confirm until started | Settings `lastError` if ERROR |
| **CONNECTING** | Connecting… | Redirecting to Meta, validating after Page confirm, or waiting for runtime readiness (including resolver unavailable). | **Run validation** / spinner | **Cancel** (pre-redirect / page select only) | Cancel where applicable, explicit health run | Connect, confirm, reconnect | Sanitized validation / `errorCategory` message |
| **AWAITING_PAGE_SELECTION** | Select a Page | Meta sign-in succeeded. Choose which Page to connect. | **Confirm Page** | **Cancel** | Page radio, confirm | Connect, manual save | `NO_PAGES`, `MISSING_PAGE_TASKS` |
| **CONNECTED** | Connected | Page linked and **all five readiness checks passed**. | **Run validation** (re-check) | **Reconnect** | Reconnect, manual | — | `lastError` sanitized |
| **DEGRADED** | Needs attention | **Post-READY only (future).** Supplemental check warned; core readiness still valid. | **Run validation** | **Reconnect** | Health check, reconnect | — | Per-check safe messages |
| **NEEDS_RECONNECT** | Reconnect required | Authorization expired or revoked. | **Reconnect Facebook** | Manual setup (expanded) | Reconnect, manual | Page confirm until OAuth done | `RECONNECT_REQUIRED`, `SESSION_EXPIRED` |
| **ERROR** | Connection error | OAuth or terminal health failure. Manual path may still work. | **Try again** | Expand manual setup | Retry, manual | Confirm until retried | `errorCategory` → operator string |

### 2.5 Derivation matrix

| Presentation state | Typical signals |
|---|---|
| NOT_CONNECTED | No `connectionId`; `connectionStatus` absent / `DRAFT` / `REVOKED`; idle OAuth; not `manualConfigured` |
| MANUAL_CONFIGURED | `manualConfigured` true; no active OAuth progress |
| CONNECTING | Local redirect in flight; **or** `oauthStage` `PENDING`; **or** `oauthStage` `COMPLETED` + `connectionStatus` `AUTHORIZING` (including pre-READY `healthStatus` `UNKNOWN`, `ERROR`, or `DEGRADED`); **or** server `displayState: CONNECTING` |
| AWAITING_PAGE_SELECTION | `oauth=success` handled; `oauthStage` `CALLBACK_RECEIVED` or `PAGES_READY`; server `displayState: AWAITING_PAGE_SELECTION` |
| CONNECTED | **`connectionStatus: READY` AND `healthStatus: OK`** — all five checks `PASS`; server `displayState: CONNECTED` |
| DEGRADED | **`connectionStatus: READY` AND `healthStatus: DEGRADED`** — post-READY supplemental only (**not Phase 1**) |
| NEEDS_RECONNECT | `reconnectRequired: true` or `healthStatus: RECONNECT_REQUIRED`; server `displayState: NEEDS_RECONNECT` |
| ERROR | `connectionStatus: ERROR` (non-reconnect); **or** `healthStatus: ERROR` when `connectionStatus: READY`; **or** `oauthStage` `FAILED`/`EXPIRED` with no recovery |

### 2.6 Pre-READY validation UX

When any required check returns `WARN` or `FAIL` before first READY:

- Keep `displayState` presentation as **CONNECTING**.
- Do **not** show **CONNECTED** or operational **DEGRADED**.
- Do **not** treat the warning as optional.
- May show sanitized inline copy, e.g. *"Validation incomplete — runtime path not ready. Run validation again after FB-OAUTH-1B activation."*
- May render `checks[]` rows with sanitized `message` only (no raw provider text).
- Valid aggregate: `healthStatus: DEGRADED` + `displayState: CONNECTING` → UI chip remains **Connecting**.

### 2.7 Status chip CSS

New scoped prefix only:

- `.channel-settings-facebook-connect-status-{state}` in `app/globals.css`
- Reuse color tokens from `.channel-settings-status-READY` / `-ERROR`

---

## 3. Connect Facebook flow (Phase 1 — `/dashboard/channel-settings`)

### 3.1 Entry point

**Single integration surface:** Facebook card on `/dashboard/channel-settings`.

- **Connect Facebook** button: `data-testid="facebook-connect-start"` — rendered only when `oauthAvailable: true` (§3.8)
- **Run validation** button: `data-testid="facebook-run-validation"` — rendered when post-`complete` **CONNECTING** (§3.7)
- Optional deep-link: `/dashboard/channel-settings?channel=facebook` scrolls/focuses Facebook card (no new route)

### 3.2 Connect button behavior

**Precondition:** `GET .../status` returns `oauthAvailable: true`. When `false`, §3.8 applies — no Connect action.

1. ADMIN clicks **Connect Facebook**.
2. UI → local **CONNECTING**; disable duplicate clicks.
3. `POST /api/channel-connect/facebook/oauth/start` with `{ reconnect?: false }` and Bearer + `x-tenant-id`.
4. Response: `{ data: { authorizeUrl, expiresAt } }` — **UI uses `authorizeUrl` only**; does not store transaction identifiers in `localStorage`/`sessionStorage` (HttpOnly cookie set by server on callback).
5. `window.location.assign(authorizeUrl)`.

### 3.3 Callback handling

```text
Meta → GET /api/channel-connect/facebook/oauth/callback?code=...&state=...
         ↓ server validates state, exchanges code server-side (never exposed to UI)
         ↓ server sets HttpOnly OAuth session cookie
         ↓ HTTP 302
Browser → /dashboard/channel-settings?channel=facebook&oauth=success
       or /dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=<UPPER_SNAKE_ENUM>
```

**UI rules:**

| Rule | Implementation |
|---|---|
| UI never receives `code` or `state` | Callback hits API route only |
| UI never receives access token | No token fields in any API response |
| After redirect with `oauth=success` | One `GET /api/channel-connect/facebook/oauth/session` (cookie-authenticated) |
| After redirect with `oauth=error` | Map `errorCategory` query (UPPER_SNAKE_CASE) → safe banner; still strip query |
| Strip query params | `history.replaceState` removes `oauth`, `errorCategory`, `channel` when done |
| Resume on refresh | Same session endpoint via HttpOnly cookie within `expiresAt` |
| No background polling | One session fetch after callback; explicit Reload/validation only |

### 3.4 OAuth resume session (backend-owned cookie — UI contract)

The backend owns the short-lived OAuth resume cookie. **The UI specification does not depend on a concrete cookie name.**

| Rule | Phase 1 |
|---|---|
| Cookie ownership | Backend sets and clears; UI never reads, writes, parses, or verifies it |
| Cookie properties | HttpOnly, Secure, SameSite=Lax, short-lived, narrowly scoped to OAuth session paths |
| Browser behavior | Cookie is sent automatically on same-origin requests to `GET /api/channel-connect/facebook/oauth/session` |
| UI JavaScript | **Must not** access `document.cookie` for OAuth resume |
| UI contract surface | Token-free response from `GET /api/channel-connect/facebook/oauth/session` only |
| Fetch credentials | Use normal same-origin credentials behavior; pass `credentials: "include"` only if the existing fetch abstraction requires it |
| Tests | Mock the session API response; **do not assert a concrete cookie name** in unit, page, or E2E tests |

UI calls `GET /api/channel-connect/facebook/oauth/session` **without** passing `transactionId` in query or body. Session validity is inferred from the token-free DTO (`oauthStage`, `displayState`, `expiresAt`, etc.).

### 3.5 Expired / invalid session

- Session returns `oauthStage: EXPIRED` or `FAILED` → **ERROR** with *"Authorization session expired. Start again."* (`SESSION_EXPIRED` / `INVALID_OR_EXPIRED_STATE`)
- Do not render Page list from stale client cache.

### 3.6 Cancel / retry

- **Cancel** before redirect: clear local busy state.
- **Cancel** during page selection: abandon flow; return to **NOT_CONNECTED** or **MANUAL_CONFIGURED**.
- **Try again** / **Reconnect**: `POST .../oauth/start` or `POST .../reconnect`.

### 3.7 Post-complete validation (Phase 1 — manual only)

Phase 1 uses **explicit manual validation**. Automatic one-shot validation after `complete` is **out of scope** (may be considered in a future phase).

**After successful `POST .../complete`:**

| Field | Value |
|---|---|
| `connectionStatus` | `AUTHORIZING` |
| `oauthStage` | `COMPLETED` |
| `healthStatus` | `UNKNOWN` |
| `displayState` | `CONNECTING` |

**UI behavior (locked):**

1. Show presentation state **CONNECTING** — never **CONNECTED**.
2. Show **Run validation** as the primary action (`data-testid="facebook-run-validation"`).
3. **Do not** automatically call `POST /api/channel-connect/facebook/health`.
4. **Do not** poll status or health in the background.

**When ADMIN clicks Run validation:**

1. Call `POST /api/channel-connect/facebook/health` **exactly once per click**.
2. Disable the button (and prevent duplicate submission) while the request is pending.
3. Show safe progress feedback (spinner / *"Validating…"*).
4. Consume structured token-free `checks[]` and render sanitized `message` values only.

**Outcome rules:**

| Result | UI behavior |
|---|---|
| All five checks `PASS` | `displayState: CONNECTED` — show **Connected** |
| Any required check `WARN` or `FAIL` before first `READY` (reconnect not proven) | Remain **CONNECTING**; never **CONNECTED**; never operational **DEGRADED**; show sanitized guidance from `checks[]` / `message`; allow **Run validation** again when idle |
| Reconnect proven | `displayState: NEEDS_RECONNECT`; show **Reconnect Facebook** per §5 |

Required checks (all must `PASS` for **CONNECTED**): `CREDENTIAL_RESOLUTION`, `PAGE_ACCESS`, `REQUIRED_TASKS`, `GRAPH_API`, `RUNTIME_TEST_CONNECTION`.

---

### 3.8 `oauthAvailable` gating (locked)

Availability is determined **only** from `GET .../status` → `oauthAvailable: boolean`. The UI must not derive OAuth availability from browser environment variables or expose server configuration names.

**When `oauthAvailable: true`:**

- Render actionable **Connect Facebook** or **Reconnect Facebook** according to `displayState` and §3.2 / §5.
- Normal OAuth flow proceeds.

**When `oauthAvailable: false`:**

- **Do not** render an actionable OAuth Connect or Reconnect button.
- Show sanitized operator text, e.g. *"Facebook assisted connection is not available in this environment."* (`data-testid="facebook-oauth-unavailable"`)
- Keep the existing manual Facebook setup section fully available (§7).
- **Do not** expose server environment-variable or feature-flag names in the UI or DOM.
- **Do not** treat OAuth unavailability as a stored-credential error.
- LINE and Instagram cards remain unchanged.

---

## 4. Page selector

Shown when presentation state is **AWAITING_PAGE_SELECTION**.

### 4.1 Token-free Page options (Agent A §8.3)

`GET /api/channel-connect/facebook/pages` returns:

```typescript
type FacebookPageOption = {
  pageId: string;
  name: string;
  tasks: string[];
  selectable: boolean;
  reasonCode: "MISSING_PAGE_TASKS" | null;
  alreadyConnected: boolean;
};
```

| Field | Rendered | Never rendered |
|---|---|---|
| Page name | Yes | — |
| Page ID | Yes | — |
| Tasks / permissions summary | Yes (humanized) | Raw Graph payloads |
| Eligibility / warning | Yes when `selectable: false` | — |
| Access token / credential reference | **Never** | — |

### 4.2 Interaction

- Single-select radio: `data-testid="facebook-page-selector"`
- **Confirm Page** → `POST /api/channel-connect/facebook/complete` with `{ pageId }` only (transaction bound by cookie)
- Empty list: safe empty state + manual setup expander (`NO_PAGES`)
- Inaccessible Page: disabled row + hint from `reasonCode` / `tasks`
- Replace existing Page: confirmation modal `data-testid="facebook-page-replace-confirm"` when `alreadyConnected` or status shows different `providerPageId`

---

## 5. Reconnect flow

### 5.1 Banner

`FacebookReconnectBanner.tsx` inside Facebook card when **NEEDS_RECONNECT** (`reconnectRequired: true`) **and** `oauthAvailable: true`:

- `data-testid="facebook-reconnect-banner"`
- **Reconnect Facebook** → `POST /api/channel-connect/facebook/reconnect` then same OAuth redirect flow

**Do not** show reconnect banner for pre-READY **CONNECTING** validation failures — only for reconnect-proven states.

### 5.2 Keep existing connection usable

- Show last known `providerPageName` / `providerPageId` from `GET .../status` while reconnect pending.
- Badge *"Reconnect in progress…"* during **CONNECTING** (OAuth redirect or validation).
- Do not show **NOT_CONNECTED** while server still reports an active connection.

### 5.3 No duplicate cards

- Single Facebook card per tenant; OAuth section augments existing card — no second Facebook panel.

---

## 6. Security and privacy UX constraints

| Rule | Phase 1 implementation |
|---|---|
| No `code` / `state` in URL displayed | Strip immediately; never render |
| No token in URL, localStorage, sessionStorage | Session via backend HttpOnly cookie + API; UI never reads cookie |
| No cookie name in UI/tests | Backend-owned resume cookie; contract is session DTO only |
| No token in client logs | Enum/boolean logs only |
| No token in HTML | No OAuth token inputs; manual token fields remain write-only password inputs |
| Sanitized errors only | Map `errorCategory` (UPPER_SNAKE_CASE); reuse `FORBIDDEN_LEAK_PATTERNS` from `channelSettingsModel.ts` |
| Structured health checks | Render `checks[].message` only — never raw Graph, credential ID, or token |
| Page ID / name | May display |
| App Secret | Manual section only; never in OAuth UI |

**Never render in DOM or storage:** access token, authorization code, OAuth state, cookie value, credential ID, raw Graph response, raw provider error, server feature-flag or env-var names.

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

Manual `channel_settings` path does **not** satisfy OAuth `RUNTIME_TEST_CONNECTION` readiness for OAuth-managed connections (Agent A §FB-OAUTH-1B).

**Do not** move, duplicate, or prefill stored secret values in the OAuth section.

---

## 8. Proposed component and file plan (implementation phase — not this PR)

### 8.1 New files

| File | Responsibility |
|---|---|
| `src/ui/facebookConnectModel.ts` | Presentation state derivation, API path helpers, UPPER_SNAKE `errorCategory` map, OAuth query strip, health `checks` rendering helpers |
| `src/ui/FacebookConnectCard.tsx` | OAuth connect section: status chip, Connect/Reconnect (when `oauthAvailable`), Run validation CTA, `oauthAvailable: false` guidance, validation checklist host |
| `src/ui/FacebookPageSelector.tsx` | Token-free page list, confirm, replace modal |
| `src/ui/FacebookReconnectBanner.tsx` | Reconnect CTA |
| `src/ui/facebookConnectModel.test.ts` | Derivation matrix, five-check gate, query strip, error map |
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
  ├─ if oauth=success: one GET .../oauth/session (backend HttpOnly cookie — UI uses DTO only)
  ├─ deriveFacebookConnectPresentationState(status, session, health) — prefer server displayState
  ├─ FacebookConnectCard
  │    ├─ oauth unavailable notice (if oauthAvailable: false)
  │    ├─ FacebookReconnectBanner (if NEEDS_RECONNECT && oauthAvailable)
  │    ├─ FacebookPageSelector (if AWAITING_PAGE_SELECTION)
  │    ├─ Run validation CTA + checklist from health checks[] (if CONNECTING after complete)
  │    └─ link to expand facebook-manual-setup
  └─ existing manual fields (unchanged PATCH/test-connection path)
```

### 8.4 Callback route UI

**No** `app/dashboard/.../oauth/callback/page.tsx`. Server callback is API-only; UI lands on Channel Settings with query hints, then strips them.

---

## 9. Test plan (implementation phase)

### 9.1 Unit (`facebookConnectModel.test.ts`)

- Derivation matrix: all eight presentation states from server `displayState` + backend fields
- **Callback success → AWAITING_PAGE_SELECTION**, not CONNECTED
- **Complete success → CONNECTING** (`connectionStatus: AUTHORIZING`, `healthStatus: UNKNOWN`) — not CONNECTED
- Pre-READY: any required check `WARN`/`FAIL` → **CONNECTING**, not CONNECTED, not DEGRADED
- Pre-READY: `healthStatus: DEGRADED` + `displayState: CONNECTING` → UI chip **Connecting**
- Resolver-disabled health mock (`RUNTIME_TEST_CONNECTION: FAIL`) → cannot produce CONNECTED
- All five checks `PASS` → CONNECTED (`healthStatus: OK`, not `READY`)
- `stripFacebookOAuthQueryParams` removes `oauth`, `errorCategory`, `code`, `state`
- `mapFacebookOAuthErrorCategory` accepts UPPER_SNAKE_CASE only; never returns raw Graph text
- Health `checks[]` rendered with sanitized messages only
- UI logic does not reference a concrete cookie name

### 9.2 Page tests (`channelSettingsPage.test.ts`)

- Integration point remains `ChannelSettingsPage.tsx` / `/dashboard/channel-settings`
- `oauthAvailable: true` → ADMIN sees `facebook-connect-start`
- `oauthAvailable: false` → no `facebook-connect-start`; sees `facebook-oauth-unavailable`; manual setup still present
- Feature-flag / env-var names never appear in rendered output
- Non-ADMIN: existing `channel-settings-access-denied` unchanged
- `oauth=success` triggers one session fetch mock (no polling); session works via mocked same-origin credentials — no cookie name assertion
- `oauth=error&errorCategory=ACCESS_DENIED` → safe banner
- Session resume via session API mock only (no `transactionId` in URL; no cookie name in test fixtures)
- After `complete` mock → **CONNECTING** + `facebook-run-validation` visible; **health endpoint not called** without click
- Run validation click → exactly one `POST .../health`; button disabled while pending
- Query stripped via `replaceState`
- LINE / Instagram cards: no `facebook-connect-start` or OAuth unavailable copy

### 9.3 E2E (extend `tests/e2e/channel-settings-smoke.spec.ts`)

| Scenario | Assertion |
|---|---|
| Session without cookie name | Mock session API only; no test asserts cookie name or reads `document.cookie` |
| `oauthAvailable: true` | Connect or Reconnect action visible per `displayState` |
| `oauthAvailable: false` | No Connect/Reconnect button; unavailable guidance + manual fallback visible |
| No feature-flag in DOM | No `HUBCHAT_`, `META_APP`, or env-var names in rendered text |
| ADMIN Connect Facebook | Button visible on Facebook card only when `oauthAvailable: true` |
| Non-ADMIN denied | Unchanged sales smoke |
| Connect redirect | Mock `oauth/start` → navigate to `authorizeUrl` |
| Callback success | Land on `channel-settings?oauth=success`; mock session → **AWAITING_PAGE_SELECTION** / page selector |
| Callback error | `oauth=error&errorCategory=ACCESS_DENIED`; safe banner; no `code`/`state` in DOM |
| Complete | Mock `complete` → **CONNECTING** + **Run validation**; not CONNECTED |
| No auto health | After complete, health endpoint call count = 0 until Run validation clicked |
| Run validation | One click → exactly one `POST .../health`; duplicate click blocked while pending |
| Pre-READY health failure | Mock `health` with any required `WARN`/`FAIL` → stays **CONNECTING**; not DEGRADED chip |
| All five PASS | Mock `health` with all `PASS` → **CONNECTED**; `healthStatus: OK` |
| Structured checks | Sanitized check messages visible; no token/raw Graph/credential ID in DOM |
| Reconnect | Banner on `NEEDS_RECONNECT`; `reconnect` mock when `oauthAvailable: true` |
| Manual fallback | Advanced section: Save/Test connection/SET/EMPTY unchanged (both `oauthAvailable` values) |
| No secrets in DOM/storage | No `EAA`, `access_token=`, `code=`, `state=`, cookie values in HTML; `localStorage`/`sessionStorage` empty of OAuth keys |
| Mobile 390px | OAuth section wraps; manual fields usable |
| LINE / Instagram unchanged | No OAuth controls or unavailable copy |
| No polling | No repeated session/status/health fetch without user action |
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

## 10. Coordination contract — agreed values

### 10.1 Agreed API surface (Agent A §3, §8)

| Endpoint | Method | UI use |
|---|---|---|
| `/api/channel-connect/facebook/status` | `GET` | Initial + Reload |
| `/api/channel-connect/facebook/oauth/start` | `POST` | Connect; body `{ reconnect?: boolean }` |
| `/api/channel-connect/facebook/oauth/callback` | `GET` | **Browser/server only** — UI never calls |
| `/api/channel-connect/facebook/oauth/session` | `GET` | Once after `oauth=success`; cookie-auth |
| `/api/channel-connect/facebook/pages` | `GET` | Page selector |
| `/api/channel-connect/facebook/complete` | `POST` | `{ pageId }` — transaction via cookie |
| `/api/channel-connect/facebook/reconnect` | `POST` | Reconnect banner |
| `/api/channel-connect/facebook/health` | `POST` | Operational validation; five-check gate |
| `/api/channel-settings/facebook` | `PATCH` | Manual fallback (unchanged) |
| `/api/channel-settings/facebook/test-connection` | `POST` | Manual path only (unchanged) |

### 10.2 Agreed response shapes (token-free — Agent A §6.5, §8)

**Status** (`GET .../status`):

```typescript
type FacebookConnectStatusResponse = {
  data: {
    connectionId: string | null;
    connectionStatus: ChannelConnectionStatus | null;
    displayState: DisplayState;
    oauthStage: OAuthTransactionStage | null;
    healthStatus: HealthStatus; // UNKNOWN | OK | DEGRADED | ERROR | RECONNECT_REQUIRED
    reconnectRequired: boolean;
    providerPageId: string | null;
    providerPageName: string | null;
    manualConfigured: boolean;
    oauthAvailable: boolean;
    lastCheckedAt: string | null;
    lastVerifiedAt: string | null;
    errorCategory: OAuthErrorCategory | null; // UPPER_SNAKE_CASE
    message: string | null;
    credentialState: { pageAccessToken: "EMPTY" | "SET" | "EXPIRED" | "REVOKED" };
  };
};
```

**OAuth start:** `{ data: { authorizeUrl: string; expiresAt: string } }` — no `transactionId` in body.

**Session** (`GET .../oauth/session`):

```typescript
{
  data: {
    oauthStage: OAuthTransactionStage;
    displayState: DisplayState; // AWAITING_PAGE_SELECTION on callback success
    errorCategory: OAuthErrorCategory | null;
    message: string | null;
    expiresAt: string;
    pagesReady: boolean;
  };
}
```

**Pages:** `{ data: { pages: FacebookPageOption[] } }`.

**Complete** (`POST .../complete`):

```typescript
{
  data: {
    connectionId: string;
    connectionStatus: "AUTHORIZING";
    oauthStage: "COMPLETED";
    healthStatus: "UNKNOWN";
    displayState: "CONNECTING";
    reconnectRequired: false;
    providerPageId: string;
    providerPageName: string;
    message: string;
  };
}
```

**Health** (`POST .../health`):

```typescript
type HealthCheck = {
  code: "CREDENTIAL_RESOLUTION" | "PAGE_ACCESS" | "REQUIRED_TASKS" | "GRAPH_API" | "RUNTIME_TEST_CONNECTION";
  status: "PASS" | "WARN" | "FAIL";
  message: string; // sanitized, token-free
};

{
  data: {
    healthStatus: HealthStatus;
    reconnectRequired: boolean;
    connectionStatus: ChannelConnectionStatus;
    displayState: DisplayState;
    lastCheckedAt: string;
    errorCategory: OAuthErrorCategory | null;
    message: string | null;
    checks: HealthCheck[];
  };
}
```

### 10.3 Canonical `errorCategory` values (UPPER_SNAKE_CASE only)

| `errorCategory` | Operator message (suggested) |
|---|---|
| `ACCESS_DENIED` | Meta sign-in was cancelled or denied. |
| `INVALID_OR_EXPIRED_STATE` | Connection request was invalid or expired. Start again. |
| `SESSION_EXPIRED` | Authorization session expired. Start again. |
| `NO_PAGES` | No manageable Pages found for this account. |
| `MISSING_PAGE_TASKS` | Selected Page is missing required permissions. |
| `TOKEN_EXCHANGE_FAILED` | Could not complete connection. Try again or use manual setup. |
| `PROVIDER_TEMPORARY` | Provider temporarily unavailable. Wait and try again. |
| `RECONNECT_REQUIRED` | Authorization expired or revoked. Reconnect required. |
| `UNKNOWN` | Something went wrong. Try again or use manual setup. |

**Invalid (must not be used in API or fixtures):** `access_denied`, `session_expired`, `no_pages`, `state_mismatch`, etc.

### 10.4 Canonical `healthStatus` values

`UNKNOWN` | `OK` | `DEGRADED` | `ERROR` | `RECONNECT_REQUIRED`

**Do not use `READY` as `healthStatus`.** `READY` is persisted `connectionStatus` only.

### 10.5 Agreed callback / session behavior (Phase 1)

| Step | Owner |
|---|---|
| Meta sends `code` + `state` to API callback | Backend |
| Code exchange server-side | Backend |
| HttpOnly cookie set | Backend |
| Redirect to `/dashboard/channel-settings?channel=facebook&oauth=success\|error` | Backend |
| One session fetch | UI |
| `history.replaceState` strip | UI |
| Page list / complete / health | UI + Backend |
| No background polling | UI |

### 10.6 Open questions

**Phase 1 contract questions resolved** (cookie ownership, `oauthAvailable` gating, manual Run validation — §3.4, §3.7, §3.8).

Implementation-level naming and layout details (exact button copy variants, checklist row ordering, spinner placement) remain local to the implementation PR and do not change the agreed API or UI behavior.

---

## Acceptance checklist (this PR)

- [x] Findings cite actual UI files and tests
- [x] Reconciled with merged FB-OAUTH-1A contract ([PR #222](https://github.com/ctarasan/HubChat/pull/222))
- [x] No runtime code change
- [x] No backend/API/migration/package change
- [x] Manual fallback remains on same card (§7)
- [x] UI never receives or displays stored Page Access Token (§6)
- [x] Phase 1 uses `/dashboard/channel-settings` only; `/dashboard/channel-connect` marked future
- [x] Five readiness-blocking checks documented; `RUNTIME_TEST_CONNECTION` always required
- [x] Lifecycle: callback → `AWAITING_PAGE_SELECTION`; complete → `CONNECTING`; five `PASS` → `CONNECTED`
- [x] UPPER_SNAKE_CASE `errorCategory`; `healthStatus` never `READY`
- [x] Structured token-free `checks[]` consumed by UI spec
- [x] Backend-owned resume cookie — UI depends on session DTO only (§3.4)
- [x] `oauthAvailable: false` UX locked (§3.8)
- [x] Phase 1 manual Run validation only — no auto-health (§3.7)

---

## References

| Document | Path |
|---|---|
| Agent A OAuth contract (PR #222) | `docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md` |
| CCP-0 wizard UX (future route) | `docs/ccp-0-channel-connect-wizard-ux-spec.md` |
| Channel Settings page | `src/ui/ChannelSettingsPage.tsx` |
| Channel Settings model | `src/ui/channelSettingsModel.ts` |
| Connection lifecycle | `src/lib/channelConnectionLifecycle.ts` |
