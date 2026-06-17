# Instagram Auth — UI & Operator Surface Matrix (IG-AUTH-0B)

Master at audit: `c506c168542396f4a10298adf5ba21243ed8d4ad` · Rebased on: `cae191b` (IG-AUTH-0 merged, PR #238)

## 1. Channel Settings — Instagram card

| Attribute | Value |
|-----------|-------|
| **Page/component** | `app/dashboard/channel-settings/page.tsx` → `src/ui/ChannelSettingsPage.tsx` (Instagram card in `CHANNEL_SETTING_ORDER`) |
| **User role** | ADMIN only (UI + API) |
| **Visible fields** | Status badge, Configured, Last verified, Updated, Last error, Enabled, Provider metadata (Page ID, Account label), Secret SET/EMPTY badges, secret password inputs (empty placeholder), Test connection, Save |
| **Write-only fields** | Access token, Verify token, App secret |
| **Returned values** | `enabled`, `configured`, `status`, `providerPageId`, `providerAccountName`, `secretState.*`, `lastVerifiedAt`, `lastError`, `updatedAt` — no raw secrets |
| **Status badges** | `NOT_CONFIGURED`, `DISABLED`, `READY`, `ERROR` + per-secret SET/EMPTY |
| **Actions** | Reload settings, Enable/disable, Edit metadata, Enter/replace secrets, Clear secret (confirm → save), Test connection, Save |
| **API endpoints** | `GET /api/channel-settings`, `PATCH /api/channel-settings/instagram`, `POST /api/channel-settings/instagram/test-connection` |
| **Error handling** | Load/save/test errors sanitized; test feedback variant success/warn/error |
| **Sensitive-data risk** | **Low** — parsers block fingerprint/Bearer patterns; secrets not in GET |
| **Tests** | `channelSettingsModel.test.ts`, `channelSettingsPage.test.ts`, `channel-settings-smoke.spec.ts` |
| **OAuth migration impact** | Replace manual secret block with OAuth connect card; collapse manual under Advanced; add connection identity from OAuth status API |

### Write-only verification

| Check | Result | Evidence |
|-------|--------|----------|
| Credential input write-only | Pass | `type="password"`, placeholder only |
| Browser state after save | Cleared | `setSecretInputs(... emptySecretInputs())` |
| Reload returns token to UI | No | `setSecretInputs({})` on load |
| SET/EMPTY only | Pass | `secretState` enum |
| Clear confirmation | Pass | `globalThis.confirm` in `requestClearSecret` |

### Instagram vs Facebook separation

| Check | Result |
|-------|--------|
| Separate card | Yes — `channel-badge-instagram` |
| Separate secret field labels | Yes — "Access token" vs "Page access token" |
| Shared Page ID label text | **Yes — both say "Facebook Page ID"** (P1 operator/OAuth confusion, not security bypass) |
| OAuth assisted | Facebook only |

---

## 2. Assisted Channel Connection Wizard

| Attribute | Value |
|-----------|-------|
| **Page/component** | **Not implemented for Instagram** |
| **Facebook reference** | `FacebookConnectCard.tsx`, `/api/channel-connect/facebook/*` |
| **User role** | N/A (IG) |
| **OAuth migration impact** | New `InstagramConnectCard` (or unified Meta card) mirroring Facebook pattern |

---

## 3. Test connection — frontend/API contract

### Request (frontend)

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/channel-settings/instagram/test-connection` |
| Body | **Empty** (no JSON) |
| Headers | `Authorization: Bearer <hubchat jwt>`, `x-tenant-id: <tenant>` |
| Credentials in request | **No** |

### Response (frontend consumption)

| Field | Used by UI | Notes |
|-------|------------|-------|
| `ok` | Yes | Drives feedback variant |
| `status` | Yes | Badge + feedback |
| `message` | Yes | Sanitized display |
| `lastVerifiedAt` | Yes | Meta row + success message |
| `lastError` | Yes | Meta row on failure |
| `channel` | Yes | Parser validation |
| Raw provider JSON | **No** | Not in DTO |
| Token/secret | **No** | Blocked by parser patterns |
| Credential source | **No** | Not in contract |

### Server behavior (UI-visible outcomes only)

| Outcome | UI `status` | Feedback |
|---------|-------------|----------|
| Health check pass | `READY` | Success |
| Health check fail | `ERROR` | Error + `lastError` |
| Disabled | `DISABLED` | Warn |
| Missing secrets | `NOT_CONFIGURED` | Warn |

Provider probe (IG-AUTH-0): `GET graph.facebook.com/{version}/{pageId}?fields=instagram_business_account{…}` using **DB** `channel_settings.secrets.accessToken` (Facebook Page access token, `EA…` family).

### Failure mapping (operator-visible)

| Scenario | Distinct UI? | Typical surface |
|----------|--------------|-----------------|
| Expired token | No | `ERROR` + message text |
| Revoked | No | Same |
| Permission missing | No | Same |
| Wrong Page / no IG link | No | Message may mention business account link |
| Rate limit | No | Generic Graph error text |
| DB missing + env fallback success | **No source indicator** | Test uses DB only — shows `NOT_CONFIGURED`/`ERROR` if DB missing; split-brain when DB expired/wrong but Railway env valid (**P1**, IG-AUTH-0 P1-4/P1-5) |

---

## 4. Profile / avatar consumers

| Surface | UI field | API source | Direct Meta call? | Leak risk |
|---------|----------|------------|-------------------|-----------|
| Inbox sidebar | `participantProfileImageUrl`, contact `profileImageUrl` | `GET /api/conversations` | No | Low — HTTPS-only normalization |
| Chat header | Same via `chatComposerModel` | Conversations API | No | Low |
| Leads | `profileImageUrl` | `GET /api/leads` | No | Low |
| Work Queue | `profileImageUrl` | Workflow API | No | Low |
| Context panel | Stored display name / image | Conversation + contact | No | Low |

| Policy | Evidence |
|--------|----------|
| `referrerPolicy="no-referrer"` | `DashboardPage.tsx:528,560` |
| Broken image fallback | initials / generic icon |
| Profile enrichment | **Parked cache** — webhook Graph lookup active server-side (IG-AUTH-0); UI uses stored URLs only |

---

## 5. Role / access matrix

| Role | View IG settings UI | Edit credential | Clear | Test | View metadata | API enforcement |
|------|--------------------:|----------------:|------:|-----:|--------------:|-----------------|
| ADMIN | Yes | Yes | Yes | Yes | Yes | `requireAuth(..., ["ADMIN"])` |
| MANAGER | No (access denied) | No | No | No | No | 403 on API |
| SALES | No (access denied) | No | No | No | No | 403 expected — **not explicitly tested** |

Nav: Channels link visible ADMIN only (`dashboardAppRailModel.ts`).

---

## 6. Credential exposure scan (frontend)

### Patterns searched

`instagram`, `INSTAGRAM`, `accessToken`, `access_token`, `appSecret`, `verifyToken`, `localStorage`, `console.`, test fixtures.

### Results

| Location | Risk | Notes |
|----------|------|-------|
| `ChannelSettingView` serialization | Mitigated | `FORBIDDEN_LEAK_PATTERNS` |
| `parseTestConnectionResponse` | Mitigated | Rejects forbidden patterns |
| `sessionConfig` localStorage | HubChat JWT only | Not IG secrets |
| `sessionStorage` | None for IG creds | — |
| E2E mocks | Placeholder strings | `Invalid OAuth token` — not real secrets |
| URL query params | None for IG creds | — |
| Console logs in Channel Settings | None for secrets | — |

---

## 7. Test inventory matrix

| Area | Test file | Type | Covered | Missing |
|------|-----------|------|---------|---------|
| ADMIN access UI | `channelSettingsPage.test.ts` | Unit | ADMIN gate, endpoints | SALES explicit |
| Role API GET | `channelSettings.route.test.ts` | API | ADMIN ok, MANAGER 403 | SALES 403 |
| Role API test | `channelSettingsTestConnection.test.ts` | API | ADMIN ok, MANAGER 403 | Instagram-specific, SALES |
| IG parser | `channelSettingsModel.test.ts` | Unit | IG row, paths, leak guards | — |
| IG secrets mapping | `channelSettingSecrets.test.ts` | Unit | fingerprint not in meta | — |
| Write-only reload | `channelSettingsPage.test.ts` | Unit | clear draft on save/reload | — |
| Clear confirm | `channelSettingsPage.test.ts` | Unit | confirm dialog | — |
| IG test ERROR E2E | `channel-settings-smoke.spec.ts` | E2E | mocked failure feedback | — |
| IG provider fields E2E | `channel-settings-smoke.spec.ts` | E2E | page id save | — |
| Non-admin E2E | `channel-settings-smoke.spec.ts` | E2E | MANAGER denied | SALES |
| No raw token in response | `channelSettingsModel.test.ts` | Unit | Bearer redaction | IG-specific integration |
| FB/IG separation | `channelSettingsPage.test.ts` | Unit | FB OAuth block not on IG | IG label confusion |
| Avatar IG mapping | `chatComposerModel.test.ts` | Unit | snake_case profile URL | — |
| OAuth states | — | — | — | All future OAuth states |
| Env fallback READY | — | — | — | UI source indicator |
| Disconnect/revoke | — | — | — | No UI |

---

## 8. API route reference (operator-facing)

| Route | Method | Auth | Body | Response |
|-------|--------|------|------|----------|
| `/api/channel-settings` | GET | ADMIN | — | `{ data: ChannelSettingPublicDto[] }` |
| `/api/channel-settings/instagram` | PATCH | ADMIN | `enabled`, `providerPageId`, `providerAccountName`, `secrets`, `clearSecrets` | `{ data: ChannelSettingPublicDto }` |
| `/api/channel-settings/instagram/test-connection` | POST | ADMIN | **empty** | `ChannelTestConnectionResponseDto` |

No `/api/channel-connect/instagram/*` routes found in `app/`.
