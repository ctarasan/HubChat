# HubChat Facebook OAuth — Browser / UI Smoke Worksheet (FB-OAUTH-1H)

Operator worksheet for **controlled browser verification** of Facebook OAuth Channel Settings UI during staging/pilot smoke.

**Companion runbook:** [`hubchat-facebook-oauth-staging-pilot-smoke-runbook.md`](hubchat-facebook-oauth-staging-pilot-smoke-runbook.md)

**Prerequisites:** Agent A FB-OAUTH-1G staging/pilot preflight PASS; flags and Meta config per runbook Section 1–2.

**Route:** `/dashboard/channel-settings` → Facebook card → **Assisted connection (Meta OAuth)**

**Do not paste secrets** into this worksheet, tickets, or screenshots.

---

## Evidence conventions

| Field | Rule |
|-------|------|
| Screenshot ID | `FB-OAUTH-UI-{section}-{nn}` e.g. `FB-OAUTH-UI-C-03` |
| Network evidence ID | `FB-OAUTH-NET-{endpoint}-{nn}` e.g. `FB-OAUTH-NET-status-01` |
| File name | `{YYYYMMDD}-{env}-fb-oauth-{section}-{nn}.png` |
| Annotation | Top margin: environment, deploy SHA (short), UTC+7 timestamp |
| Redact | Crop/blur any token, code, state, cookie, JWT, Authorization header, credential ID |

**Never commit HAR files containing secrets to Git.**

---

## A. Before enablement

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| A1 | Record Vercel + Railway deploy SHA | | | | | | |
| A2 | Environment = staging or production-pilot (isolated) | | | | | | |
| A3 | Browser + version recorded | | | | | | |
| A4 | Operator role = ADMIN for pilot tenant | | | | | | |
| A5 | `HUBCHAT_FACEBOOK_OAUTH_ENABLED` observed on/off (env name only) | | | | | | |
| A6 | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` observed on/off | | | | | | |
| A7 | Expected pilot Page ID (numeric) recorded | | | | | | |
| A8 | Expected tenant UUID recorded | | | | | | |
| A9 | Agent A FB-OAUTH-1G preflight PASS confirmed | | | | | | BLOCKED if preflight incomplete |

---

## B. OAuth unavailable baseline

Run **before** enabling OAuth flag, or on deploy with `oauthAvailable: false`.

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| B1 | Facebook card loads; badge **Not connected** or **Manual setup** | | | FB-OAUTH-UI-B-01 | FB-OAUTH-NET-status-01 | | |
| B2 | Hint: *Facebook assisted connection is not available in this environment.* (`facebook-oauth-unavailable`) | | | FB-OAUTH-UI-B-02 | | | |
| B3 | **Connect Facebook** button **not** shown | | | FB-OAUTH-UI-B-02 | | | |
| B4 | Manual setup `<details>` (`facebook-manual-setup`) visible and usable | | | FB-OAUTH-UI-B-03 | | | |
| B5 | `GET /api/channel-connect/facebook/status` → 200; `oauthAvailable: false` in body | | | | FB-OAUTH-NET-status-01 | No token fields | |
| B6 | Status **404** shows load-error (`facebook-connect-status-load-error`) — **not** unavailable hint | | | | | Distinct from B2 | SC13 if confused |
| B7 | Manual Test Connection still works | | | FB-OAUTH-UI-B-04 | | | |

---

## C. OAuth connect flow

Run after Agent A enables flags per runbook. Requires real Meta sign-in.

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| C1 | Reload Channel Settings; `oauthAvailable: true` | | | FB-OAUTH-UI-C-01 | FB-OAUTH-NET-status-02 | | |
| C2 | Badge **Not connected**; **Connect Facebook** visible | | | FB-OAUTH-UI-C-01 | | | |
| C3 | Click Connect → `POST /oauth/start` → 200; `authorizeUrl` only (no token) | | | FB-OAUTH-UI-C-02 | FB-OAUTH-NET-start-01 | | |
| C4 | Browser navigates to Meta (screenshot URL bar only — no secrets) | | | FB-OAUTH-UI-C-02 | | | |
| C5 | After Meta sign-in → redirect `?channel=facebook&oauth=success` | | | FB-OAUTH-UI-C-03 | | Query stripped after load | |
| C6 | No `code` or `state` in browser URL after redirect processed | | | | | | SC8 |
| C7 | Badge **Select a Page** (`AWAITING_PAGE_SELECTION`) — **not** Connected | | | FB-OAUTH-UI-C-04 | FB-OAUTH-NET-session-01 | | SC1 |
| C8 | Page list loads; token-free options (`pageId`, `name`, `tasks` only) | | | FB-OAUTH-UI-C-05 | FB-OAUTH-NET-pages-01 | | |
| C9 | Multiple Pages → operator must select one; confirm disabled until selection | | | FB-OAUTH-UI-C-05 | | | |
| C10 | Non-selectable Page shows MISSING_PAGE_TASKS guidance | | | FB-OAUTH-UI-C-05 | | | |
| C11 | Confirm Page → `POST /complete` body `{ "pageId": "..." }` only | | | | FB-OAUTH-NET-complete-01 | | |
| C12 | After complete → badge **Connecting…** — **not** Connected | | | FB-OAUTH-UI-C-06 | | | SC1 |
| C13 | **Run validation** prompt visible; health **not** auto-run | | | FB-OAUTH-UI-C-06 | | | |

**Callback error path (if tested):**

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| C14 | `?oauth=error&errorCategory=...` → sanitized banner; badge **Connection error** | | | FB-OAUTH-UI-C-07 | | No raw Meta JSON | SC9 |
| C15 | Refresh after error does not re-trigger unsafe actions | | | | | `oauthCallbackHandled` single-use | |

---

## D. Health validation

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| D1 | Click **Run validation** → `POST /health` → 200 | | | FB-OAUTH-UI-D-01 | FB-OAUTH-NET-health-01 | | |
| D2 | Button shows **Validating…** while in flight; no duplicate spam | | | FB-OAUTH-UI-D-01 | | | |
| D3 | Five checks listed with code + PASS/WARN/FAIL + message | | | FB-OAUTH-UI-D-02 | | See table below | |
| D4 | `CREDENTIAL_RESOLUTION` | PASS required for Connected | | | | | SC1 |
| D5 | `PAGE_ACCESS` | PASS required | | | | | SC1 |
| D6 | `REQUIRED_TASKS` | PASS required | | | | | SC1 |
| D7 | `GRAPH_API` | PASS required | | | | | SC1 |
| D8 | `RUNTIME_TEST_CONNECTION` | PASS required (resolver on) | | | | | SC1 |
| D9 | Any FAIL → badge stays **Connecting…**; no `facebook-connect-ready` | | | FB-OAUTH-UI-D-03 | | | SC1 |
| D10 | All five PASS → badge **Connected**; `facebook-connect-ready` visible | | | FB-OAUTH-UI-D-04 | | | |
| D11 | No outbound-ready messaging before D10 | | | | | | SC2 |
| D12 | Record `connectionStatus: READY` in status response | | | | FB-OAUTH-NET-status-03 | | |

---

## E. Reconnect

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| E1 | Simulate or reach `NEEDS_RECONNECT`; badge **Reconnect required** | | | FB-OAUTH-UI-E-01 | FB-OAUTH-NET-status-04 | | |
| E2 | Reconnect banner visible (`facebook-reconnect-banner`) | | | FB-OAUTH-UI-E-01 | | | |
| E3 | Linked Page still shown; copy does not claim credential deleted | | | FB-OAUTH-UI-E-01 | | | SC7 |
| E4 | Click **Reconnect Facebook** → `POST /reconnect` → 200; `authorizeUrl` only | | | FB-OAUTH-UI-E-02 | FB-OAUTH-NET-reconnect-01 | | |
| E5 | During initiation → **Reconnecting…**; not Connected | | | FB-OAUTH-UI-E-02 | | | SC7 |
| E6 | Failed reconnect → sanitized error; prior credential preserved | | | FB-OAUTH-UI-E-03 | | | SC7 |
| E7 | Successful reconnect → CONNECTING until health PASS again | | | FB-OAUTH-UI-E-04 | | | SC1 |

---

## F. Outbound observation (after Agent A preflight + Section D PASS)

Execute per runbook Section 5. Browser observes Inbox composer only.

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| F1 | Record connection status `READY` before send | | | | FB-OAUTH-NET-status-05 | | SC2 |
| F2 | Send text from Inbox; message queued | | | FB-OAUTH-UI-F-01 | | | |
| F3 | Message appears on **pilot Page** in Meta UI | | | FB-OAUTH-UI-F-02 | | | SC3, SC4 |
| F4 | Send image (if enabled) | | | FB-OAUTH-UI-F-03 | | | |
| F5 | Delivery status accurate in UI; no false DONE | | | FB-OAUTH-UI-F-04 | | | SC10 |
| F6 | Ops `/dashboard/ops` queue stable | | | FB-OAUTH-UI-F-05 | | | |

---

## G. Rollback browser observation

Per runbook Section 10 safe rollback sequence.

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| G1 | After `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` → unavailable hint; Connect hidden | | | FB-OAUTH-UI-G-01 | | | |
| G2 | Manual setup still accessible | | | FB-OAUTH-UI-G-02 | | | |
| G3 | Connection state visible (not falsely Connected if health incomplete) | | | FB-OAUTH-UI-G-01 | | | |
| G4 | After validated legacy restoration → outbound on intended Page | | | FB-OAUTH-UI-G-03 | | | SC3 |

---

## H. Security review

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| H1 | DOM search: no `EAA`, `access_token`, `code`, `state`, Bearer | | | | | | SC8 |
| H2 | Network bodies token-free (see checklist below) | | | | All FB-OAUTH-NET-* | | SC8 |
| H3 | Callback URL clean after processing | | | | | | SC6 |
| H4 | Screenshot review — no secrets | | | All | | | SC8 |
| H5 | Queue/outbox/message metadata (ops) — no tokens | | | | | Worker path | SC8 |

---

## I. Manual Facebook regression (browser)

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| M1 | Tenant without OAuth-managed connection | Manual fields work | | | | | |
| M2 | Page token write-only; reload shows blank; badge SET/EMPTY | | | FB-OAUTH-UI-M-01 | | | |
| M3 | Test Connection success when configured | | | FB-OAUTH-UI-M-02 | | | |
| M4 | OAuth defect does not silently show manual path as connected | | | | | | SC13 |

---

## J. LINE / Instagram regression (browser)

| Step | Expected | Observed | PASS / FAIL / BLOCKED | Screenshot ID | Network ID | Notes | Stop |
|------|----------|----------|------------------------|---------------|------------|-------|------|
| L1 | LINE card loads; no Facebook OAuth controls | | | FB-OAUTH-UI-L-01 | | | SC12 |
| L2 | Instagram card loads; no Facebook OAuth controls | | | FB-OAUTH-UI-L-02 | | | SC12 |
| L3 | No `/api/channel-connect/facebook/*` from LINE/IG navigation | | | | | | SC12 |

---

## DOM secret-leak inspection checklist

Search DevTools Elements + Console for each pattern. **FAIL on any match.**

| Pattern | Surfaces |
|---------|----------|
| `EAA` (Page token prefix) | DOM, Network response bodies, console |
| `access_token` | DOM, Network, localStorage |
| `app_secret` / App Secret | DOM, Network |
| OAuth `code` | URL after redirect processed, DOM |
| OAuth `state` | URL, DOM |
| Resume cookie name/value | Application → Cookies, Network |
| `credential` + UUID id | DOM, Network |
| `Authorization: Bearer` | Network request headers (except expected session JWT shape — no Page token) |
| Raw Meta Graph JSON with tokens | Network, console |

---

## Network endpoint evidence plan

| Endpoint | Method | Expected status | Safe fields | Forbidden fields | Evidence rule |
|----------|--------|-----------------|-------------|------------------|---------------|
| `/api/channel-connect/facebook/status` | GET | 200 | `displayState`, `oauthAvailable`, `connectionStatus`, `healthStatus`, `providerPageId`, `providerPageName`, `checks` absent, `credentialState.pageAccessToken` enum only | `access_token`, `authorizeUrl` (N/A), raw secrets | Screenshot Network panel JSON; redact tenant if policy requires |
| `/api/channel-connect/facebook/oauth/start` | POST | 200 | `authorizeUrl` (Meta URL only) | token, code, state, cookie | Capture URL host only in screenshot |
| `/api/channel-connect/facebook/oauth/session` | GET | 200 | `oauthStage`, `displayState`, `pagesReady`, `expiresAt` | token, code, state | After callback only |
| `/api/channel-connect/facebook/pages` | GET | 200 | `pageId`, `name`, `tasks`, `selectable`, `reasonCode` | token | |
| `/api/channel-connect/facebook/complete` | POST | 200 | `connectionStatus: AUTHORIZING`, `displayState: CONNECTING` | token, READY premature | Request body: `{ pageId }` only |
| `/api/channel-connect/facebook/health` | POST | 200 | `checks[]`, `healthStatus`, `connectionStatus`, `displayState` | token | Each check code/status/message |
| `/api/channel-connect/facebook/reconnect` | POST | 200 | `authorizeUrl` | token | |
| Inbox send (outbound) | POST | 2xx | message id, delivery status | token in payload | During Section F only |

**HAR rule:** If exporting HAR for incident review, store offline only; strip `Authorization`, cookies, and response bodies before any shared artifact.

---

## Screenshot evidence plan

| ID | When | Must show | Must NOT show | Crop/redact |
|----|------|-----------|---------------|-------------|
| FB-OAUTH-UI-B-01 | Baseline | Card, badge, unavailable hint | Tokens | — |
| FB-OAUTH-UI-C-02 | Connect start | Connect button, loading if any | Network auth headers | — |
| FB-OAUTH-UI-C-04 | Post-callback | Select a Page badge | code/state in URL | Crop URL bar |
| FB-OAUTH-UI-C-05 | Page picker | Page names, IDs, tasks | — | — |
| FB-OAUTH-UI-C-06 | Post-complete | Connecting + Run validation | Connected badge | — |
| FB-OAUTH-UI-D-02 | Health checks | All five rows with status | — | — |
| FB-OAUTH-UI-D-04 | Connected | Connected badge + ready hint | — | — |
| FB-OAUTH-UI-E-01 | Reconnect | Banner + linked Page | — | — |
| FB-OAUTH-UI-F-02 | Outbound | Inbox + Meta Page view | PSID if sensitive | — |
| FB-OAUTH-UI-G-01 | Rollback | OAuth disabled state | — | — |
| FB-OAUTH-UI-L-01/02 | LINE/IG | Cards without OAuth section | — | — |

**Naming:** `20260617-staging-fb-oauth-D-04.png`
**Annotation:** `staging | sha:a9e593d | 2026-06-17 14:30 +07`

---

## Stop conditions (HALT immediately)

| ID | Condition |
|----|-----------|
| SC1 | CONNECTED before all five checks PASS |
| SC2 | Outbound available or sent before `READY` |
| SC3 | Page mismatch or wrong Page receives message |
| SC4 | Cross-tenant or cross-Page routing observed |
| SC5 | OAuth callback redirect loop |
| SC6 | Stale `oauth=success` query falsely restores Connected on refresh |
| SC7 | Reconnect destroys or hides working credential prematurely |
| SC8 | Token, code, state, cookie, JWT, or Authorization value visible |
| SC9 | Raw provider error or stack trace in UI |
| SC10 | Resolver/worker failure → false DONE in delivery UI |
| SC11 | Facebook OAuth controls on LINE/Instagram cards |
| SC12 | Layout hides validation failures from operator |
| SC13 | Browser display state disagrees with API `displayState` / `connectionStatus` |

On HALT: execute runbook Rollback Section 10; record worksheet row + screenshot ID.

---

## Operator sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Browser smoke operator | | | PASS / FAIL / BLOCKED |
| Release owner | | | GO / NO-GO |
