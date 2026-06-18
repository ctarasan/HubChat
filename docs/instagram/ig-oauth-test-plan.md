# Instagram OAuth — Test Plan Design (IG-AUTH-1B)

Test design only — **no test code in this deliverable**. Implements security, failure, migration, and role-denial coverage for Instagram OAuth UX.

Reference: `channelSettingsModel.test.ts`, `channel-settings-smoke.spec.ts`, Facebook OAuth smoke worksheet patterns.

---

## Test strategy

| Layer | Focus |
|-------|-------|
| Unit/component | State mapping, error sanitization, action visibility, no secrets in render |
| API contract | DTO shape, ADMIN-only writes, forbidden fields |
| E2E | Full operator journeys with mocked or staging Meta |
| Production smoke | Post-deploy validation with test IG account |

---

## Unit / component matrix

| ID | Area | Case | Assert |
|----|------|------|--------|
| U-01 | Role | Non-ADMIN renders access denied | No connect card actions |
| U-02 | Role | ADMIN sees InstagramConnectCard | Connect visible |
| U-03 | State map | Each `InstagramConnectDisplayState` → correct badge class | Snapshot CSS class |
| U-04 | State map | `CONNECTED` ≠ `CONNECTED_LEGACY` badge | Distinct labels |
| U-05 | Error map | Each `InstagramSafeErrorCode` → title + action | No raw provider text |
| U-06 | Error map | Unknown code → generic safe message | No throw |
| U-07 | Actions | `availableActions` drives button visibility | No orphan actions |
| U-08 | Secrets | Serialize view model | `FORBIDDEN_LEAK_PATTERNS` pass |
| U-09 | Identity | Renders `providerAccountDisplayName` + masked ID | No full IG user id |
| U-10 | Identity | Legacy shows linked Page label secondary | Not "Facebook Page ID" primary |
| U-11 | Callback | `stripInstagramOAuthQueryParams` removes session param | No code in URL mock |
| U-12 | Callback | `oauthCallbackHandled` ref prevents double complete | Single success toast |
| U-13 | Disconnect | Confirm dialog required | Cancel aborts |
| U-14 | Migration | Cutover confirm required | Cancel aborts |
| U-15 | Expiry | `TOKEN_EXPIRING` uses `tokenExpiresAt` prop only | No token parse mocks |
| U-16 | Delivery | `credentialHealth.deliveryPath` displayed | OAuth/Legacy/Env labels |
| U-17 | Health list | Failed checks render individually | Not single ERROR string |
| U-18 | Polling | Backoff timer respects unmount | No leaks after unmount |

**Files (future):** `instagramConnectModel.ts`, `InstagramConnectCard.tsx`, `InstagramReconnectBanner.tsx` — mirror `facebookConnectModel.test.ts`.

---

## API contract matrix

| ID | Endpoint | Case | Assert |
|----|----------|------|--------|
| A-01 | GET status | ADMIN 200 | Body has no prohibited fields |
| A-02 | GET status | MANAGER 403 | No connection data |
| A-03 | GET status | SALES 403 | No connection data |
| A-04 | POST oauth/start | ADMIN 200 | `redirectUrl` only; no token |
| A-05 | POST oauth/start | MANAGER 403 | — |
| A-06 | GET oauth/session | Valid session | No `authorizationCode` |
| A-07 | POST health | PASS | `checks[]` populated; no secrets |
| A-08 | POST health | TOKEN_REVOKED mapping | `safeErrorCode` set |
| A-09 | POST health | PERMISSION_MISSING | Capability fail detail sanitized |
| A-10 | POST disconnect | ADMIN success | Status DISCONNECTED; no token in response |
| A-11 | POST migrate/* | ADMIN only | MANAGER 403 |
| A-12 | Status | `TOKEN_EXPIRING` | `tokenExpiresAt` ISO only |
| A-13 | Status | `CONNECTED_LEGACY` | `authMethod=LEGACY` |
| A-14 | Status | `credentialHealth.deliveryPath` | Enum only |
| A-15 | Parser | Response with `accessToken` field | Parser rejects |
| A-16 | Parser | Response with `rawProviderResponse` | Parser rejects |
| A-17 | Alignment | Health uses same resolver as worker smoke | **PAA** — integration with Agent A |

---

## E2E matrix

| ID | Journey | Steps | Assert |
|----|---------|-------|--------|
| E-01 | Connect success | Connect → mock Meta → callback → health | CONNECTED; identity visible |
| E-02 | Authorization denied | Meta deny redirect | AUTHORIZATION_DENIED; NOT_CONNECTED |
| E-03 | Invalid state | Tampered session id | INVALID_CALLBACK_STATE |
| E-04 | Missing permission | Health returns PERMISSION_MISSING | Checklist visible; Reauthorize |
| E-05 | Account mismatch | Wrong account selected | ACCOUNT_MISMATCH |
| E-06 | Duplicate account | Server 409 mapping | ACCOUNT_ALREADY_CONNECTED + support ref |
| E-07 | Test fail | Health fail | TEST_FAILED; checks list |
| E-08 | Reauthorize | REAUTH_REQUIRED → reconnect flow | Returns CONNECTED |
| E-09 | Legacy migration | Start → OAuth → test → cutover | deliveryPath OAuth; legacy banner gone |
| E-10 | Rollback | Cutover → rollback | CONNECTED_LEGACY restored |
| E-11 | Disconnect | Confirm disconnect | DISCONNECTED; no secrets in network |
| E-12 | MANAGER denied | Login as MANAGER | Access denied; zero status API calls |
| E-13 | SALES denied | Login as SALES | Access denied |
| E-14 | Browser back | After success, back button | No code in URL; stable CONNECTED |
| E-15 | Callback reload | Refresh callback processing page | Idempotent success |
| E-16 | Network panel | Full connect flow | No `access_token` in responses |
| E-17 | Storage | After connect | No Meta token in localStorage/sessionStorage |
| E-18 | TOKEN_EXPIRING | Mock status | Banner shows date; no client token decode |

**Fixture:** Staging Meta test app — `PENDING_AGENT_A_ARCHITECTURE`.

---

## Production smoke design

Worksheet for operator post-deploy validation (mirror `docs/hubchat-facebook-oauth-ui-smoke-worksheet.md`).

| # | Check | Pass criteria | Evidence |
|---|-------|---------------|----------|
| S-01 | OAuth connect | Test IG account connects; identity matches | Screenshot status card |
| S-02 | READY identity | @username + masked ID on card | — |
| S-03 | DM text | Outbound text delivers | Conversation message id |
| S-04 | DM image | Image outbound delivers | Media message id |
| S-05 | Private reply | First comment private reply | `private_reply_sent_at` |
| S-06 | Source Post | Inbound comment shows snippet/thumbnail | Conversation metadata |
| S-07 | Profile lookup | Sender name/avatar from webhook path | Inbox avatar visible |
| S-08 | Refresh evidence | `lastRefreshAt` updates or reauth path documented | Ops log **PAA** |
| S-09 | Disconnect/reconnect | Disconnect stops delivery; reconnect restores | — |
| S-10 | Legacy fallback disabled | After migration cutover, `deliveryPath=OAUTH` only | Status API |
| S-11 | Secret leak check | Network + browser storage + URL | No token fragments |
| S-12 | Test/runtime align | Test PASS implies worker uses OAuth credential | Send smoke + status |
| S-13 | MANAGER blocked | MANAGER cannot open connect UI | Access denied |
| S-14 | Rollback window | Rollback restores legacy during monitoring | **PAA** timing |

---

## Security-focused tests (all layers)

| Risk | Test coverage |
|------|---------------|
| Token in API response | A-01, A-15, E-16 |
| Token in URL | E-14, E-15, U-11 |
| Token in storage | E-17 |
| Raw Meta error | U-05, A-08 |
| OAuth code in localStorage | E-17, design prohibition |
| Console logging callback | Manual review + lint rule |
| MANAGER write | A-02, E-12 |
| Legacy/OAuth confusion | U-04, E-09 |

---

## Migration-specific tests

| Phase | Tests |
|-------|-------|
| Pre-migration | E-09 step 1 — legacy still CONNECTED_LEGACY |
| OAuth valid | Health pass on OAuth credential before cutover |
| Canary | deliveryPath shows dual indicator **PAA** |
| Cutover | E-09 — legacy fallback blocked |
| Failure | Migration fail — legacy still active (journey doc) |
| Rollback | E-10 |
| Retire legacy | Manual credential SET/EMPTY cleared; OAuth only |

---

## Gaps / dependencies

| Gap | Owner |
|-----|-------|
| Staging Meta app credentials | Ops / Agent A |
| Mock OAuth server for CI | Agent A |
| Resolver alignment integration test | Agent A |
| SALES explicit API test | Optional P2 from IG-AUTH-0B |

---

## Acceptance mapping

| Criterion | Test IDs |
|-----------|----------|
| New connect | E-01, U-03, A-04 |
| Migration | E-09, E-10, migration section |
| Reauth | E-08, U-15 |
| Disconnect | E-11, U-13 |
| Rollback | E-10 |
| OAuth/legacy distinction | U-04, A-13 |
| No manual token (new OAuth) | Design + E-01 (no password fields) |
| Identity label | U-10 |
| Credential source | U-16, A-14, S-10 |
| Error taxonomy | U-05, A-08 |
| Role matrix | E-12, E-13, A-02, A-03 |
| Safe DTO | A-01, A-15, A-16 |
| Security | E-16, E-17, S-11 |
