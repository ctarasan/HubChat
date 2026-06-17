# Agent B — IG-AUTH-0B Instagram Auth UI, Test Connection & Operator Surface Audit

## Status

Complete — docs/report only (no product runtime changes).

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | IG-AUTH-0B |
| Date | 2026-06-17 |
| Branch | `docs/ig-auth-0b-ui-operator-audit` |
| Primary docs | `docs/instagram/ig-auth-ui-operator-matrix.md`, `docs/instagram/ig-oauth-ux-inputs.md` |
| Master at audit | `c506c168542396f4a10298adf5ba21243ed8d4ad` |
| Rebased on master | `cae191b02cf62d9dcd4738ea79803a38ec95963e` (includes merged IG-AUTH-0, PR #238) |
| Cross-reference | Agent A [`2026-06-17-ig-auth-0-current-state-audit.md`](../agent-a/2026-06-17-ig-auth-0-current-state-audit.md) |

## Executive summary

Instagram authentication for operators today is **manual credential entry only** on **Channel Settings** (`/dashboard/channel-settings`). There is **no** Instagram Assisted Channel Connection Wizard, OAuth card, reconnect banner, or webhook copy UI. Facebook has OAuth-assisted connection (`FacebookConnectCard`); Instagram uses the same manual pattern as LINE with three write-only secret fields.

Credentials are **write-only** on the primary path: API returns `secretState` SET/EMPTY only; password inputs use transient draft state cleared after save/reload. Test connection is **POST with empty body**; the server probes **`channel_settings` DB only** (`getRuntimeConfigForConnectionTest`). Worker outbound uses **`DB_WITH_ENV_FALLBACK`** — a confirmed **P1** test/runtime split (IG-AUTH-0 P1-4); the UI shows no credential-source indicator.

**READY** in the UI means `status === "READY"` from API after a successful test or persisted row state — not a distinct OAuth lifecycle. The UI does **not** distinguish expired, revoked, permission-missing, or wrong-account failures as separate operator states; failures collapse to **Error** + `lastError` text.

No **P0** credential leakage to the browser was found in UI contracts or parsers. **P1** gaps: Instagram Page ID field is labeled **Facebook Page ID** (operator confusion vs Facebook card); no credential-source indicator when env fallback may mask DB gaps; no re-auth/disconnect OAuth states.

## Required conclusions

### 1. What operators enter via UI today

On **Channel Settings → Instagram** card (`ChannelSettingsPage.tsx`, `channelSettingsModel.ts`):

| Field | UI label | PATCH key / API | Write-only |
|-------|----------|-----------------|------------|
| Access token | Access token | `secrets.accessToken` → storage `access_token` | Yes |
| Verify token | Verify token | `secrets.verifyToken` → `verify_token` | Yes |
| App secret | App secret | `secrets.appSecret` → `app_secret` | Yes |
| Facebook Page ID | **Facebook Page ID** (hint: linked to IG Business account) | `providerPageId` | No (readable) |
| Account label | Account label | `providerAccountName` | No (readable) |
| Enabled | Enabled checkbox | `enabled` | No |

**Not exposed in UI:** Instagram Business Account ID (`INSTAGRAM_ACCOUNT_ID` / `providerIgAccountId`), webhook URL, Graph version, long-lived token expiry. **Runtime token family (IG-AUTH-0):** Facebook Page access token (`EA…`) via `graph.facebook.com/{pageId}/…`; Instagram Login tokens (`IGA…`) are rejected at outbound. Health probe: `GET /{pageId}?fields=instagram_business_account{…}` (`verifyInstagramChannelHealth`).

### 2. Write-only on all paths?

| Path | Write-only? | Evidence |
|------|-------------|----------|
| GET `/api/channel-settings` | Yes | `ChannelSettingPublicDto` — `secretState` only (`channelSettings.ts:36-53`) |
| PATCH response | Yes | Same DTO; page clears `secretInputs` after save (`ChannelSettingsPage.tsx:300-301`) |
| Reload | Yes | `applyChannelRows` resets `secretInputs` to `{}` (`ChannelSettingsPage.tsx:129`) |
| Test connection response | Yes | `ChannelTestConnectionResponseDto` — no secrets (`channelSettings.ts:60-67`); `FORBIDDEN_LEAK_PATTERNS` in parser (`channelSettingsModel.ts:58-63`, `684-687`) |
| Browser storage | Session only | `sessionConfig.ts` stores `baseUrl`, `tenantId`, HubChat `accessToken` — not IG secrets |

**Gap:** Transient `secretInputs` holds typed secrets in React state until save/clear; not persisted to `localStorage`. Operators pasting tokens remain in memory until navigation — expected for password fields.

### 3. Test connection request/response contract (frontend lens)

**Trace:**

```text
Click "Test connection"
→ testConnection() (ChannelSettingsPage.tsx:310-367)
→ POST /api/channel-settings/instagram/test-connection
   Headers: Authorization Bearer, x-tenant-id
   Body: none
→ parseTestConnectionResponse → buildTestConnectionFeedback
→ applyTestConnectionToView (status, lastVerifiedAt, lastError)
→ badges + feedback div
```

**Request:** No credential values; no `channel_connection_id` in body. Tenant from `x-tenant-id` + auth context. **IG-AUTH-0 confirms:** Instagram test connection does **not** use Channel Connect or OAuth resolver paths — `channel_settings` DB only; Facebook OAuth `tryOAuthManagedFacebookRuntime` is skipped for `INSTAGRAM`.

**Response fields consumed:** `ok`, `status`, `message`, `lastVerifiedAt`, `lastError`, `channel`. Provider metadata from health check may update `providerPageId` / `providerAccountName` server-side but is not returned as raw Graph payload to the client.

**READY meaning (frontend):** `result.ok && result.status === "READY"` → success feedback (`channelSettingsModel.ts:598-605`). Status badge shows **Ready** (`statusDisplayLabel`). Does not imply OAuth or Channel Connect binding.

### 4. Distinct failure states in UI?

| Failure type | Distinct UI state? | Evidence |
|--------------|-------------------|----------|
| Token expired | No | Generic `ERROR` + sanitized `lastError` |
| Revoked | No | Same |
| Permission missing | No | Same |
| Wrong account / Page mismatch | No | IG health may fail with link message; UI shows text only |
| Disabled channel | Yes | `DISABLED` + warn feedback |
| Not configured | Yes | `NOT_CONFIGURED` + warn feedback |
| Network error | Generic | fetch catch → error feedback |

Facebook OAuth card has richer states (`FacebookConnectCard.tsx`); Instagram has none.

### 5. Browser exposure

Audit found **no** raw Instagram access token, app secret, or verify token in API parsers, rendered views, or `localStorage`. `sanitizeUserFacingError` redacts `Bearer` and `secret_json` substrings (`channelSettingsModel.ts:557-559`). Tests assert no fingerprint in serialized view (`channelSettingsModel.test.ts:117-128`).

**HubChat session** `accessToken` in `localStorage` is the operator's Supabase/API JWT, not Meta credentials.

### 6. Role access (UI + API)

| Role | View Channel Settings | Edit credentials | Clear | Test | View metadata |
|------|----------------------|------------------|-------|------|---------------|
| ADMIN | Yes | Yes | Yes | Yes | Yes |
| MANAGER | Denied UI | API 403 | API 403 | API 403 | API 403 |
| SALES | Denied UI | API 403 | API 403 | API 403 | API 403 |

- UI: `meContext.role !== "ADMIN"` → access denied (`ChannelSettingsPage.tsx:136-136, 411-418`)
- API GET/PATCH: `requireAuth(req, ["ADMIN"])` (`app/api/channel-settings/route.ts:16`, `[channel]/route.ts:35`)
- API test: `requireAuth(req, ["ADMIN"])` (`test-connection/route.ts:19`)
- Nav: `canViewChannelsNav` → ADMIN only (`dashboardAppRailModel.ts:38-40`)
- E2E: manager sees access denied, zero GET `/api/channel-settings` (`channel-settings-smoke.spec.ts:514-532`)

### 7. Instagram vs Facebook identity separation

| Aspect | Facebook | Instagram |
|--------|----------|-----------|
| OAuth assisted UI | `FacebookConnectCard` | **None** |
| Manual setup | Collapsed under "Advanced / manual setup" | **Always visible** manual fields |
| Page ID label | Facebook Page ID | **Also labeled Facebook Page ID** (`channelSettingsModel.ts:100-107`) |
| Secret fields | Page access token, app secret, verify token | Access token, verify token, app secret |
| Channel badge | `channel-badge-facebook` | `channel-badge-instagram` |

**P1:** Shared "Facebook Page ID" label on Instagram card may imply shared credentials with Facebook Messenger setup.

### 8. Profile/avatar UI

Uses **stored** `participantProfileImageUrl` / contact profile URLs from HubChat APIs — **no** direct Meta/Instagram API calls from browser (`DashboardPage.tsx` `referrerPolicy="no-referrer"`; `chatComposerModel.ts` HTTPS normalization).

Operator-facing docs note profile enrichment is **parked** for cache (`docs/hubchat-lead-source-badge-operator-guide.md:55`). No browser path triggers live Meta lookup.

### 9. Parked enrichment — active UI paths?

None for live enrichment in the browser. Avatars use snapshot/stored URLs only. **IG-AUTH-0 cross-confirmed:** `InstagramAdapter.fetchUserProfile` is **active at webhook ingest** (server-side); `ProfileAvatarCacheWorker` remains **parked** (opt-in flag default off). UI consumes stored URLs only.

### 10. Test coverage

See `docs/instagram/ig-auth-ui-operator-matrix.md` test matrix. Strong on model/parser security and E2E Instagram card smoke; gaps on SALES API denial, env-fallback READY masking, distinct OAuth failure states, IG Business Account ID display.

### 11. OAuth migration UI needs

See `docs/instagram/ig-oauth-ux-inputs.md`.

### 12. Resolved via IG-AUTH-0 (merged PR #238)

| Topic | IG-AUTH-0 conclusion | UI/operator implication |
|-------|---------------------|-------------------------|
| Token family | Facebook Page access token (`EA…`); `IGA…` rejected | Manual "Access token" field must remain Page-linked token |
| Test vs runtime | Test: `channel_settings` DB only; worker: `DB_WITH_ENV_FALLBACK` (**P1**) | READY badge may not reflect Railway env fallback |
| Webhook secrets | ENV verify/app secret only; DB secrets are UI `configured` gate | Manual verify/app secret fields do not drive live webhook auth |
| Outbound binding | No `channel_connection_id` on IG outbound (**P1**, intra-tenant risk) | UI has no connection picker; test does not bind per conversation |
| Refresh | No Instagram runtime refresh consumer | No refresh/re-auth UI expected today |
| Profile | Webhook Graph lookup active; avatar cache parked | UI shows stored URLs only |

### 13. Remaining UNKNOWN (post IG-AUTH-0)

- Instagram OAuth start URL, callback routes, and safe status DTOs (no implementation in codebase)
- Required OAuth scopes and App Review status for future connect flow
- Operator-facing structured error codes for revoked/expired tokens (UI collapses to generic `ERROR` today)
- Production `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` state per tenant for Instagram CC outbound path

## Findings by severity

### P0

None identified in UI/frontend contract audit.

### P1

| ID | Finding | Evidence |
|----|---------|----------|
| P1-1 | Instagram provider Page field labeled **Facebook Page ID** — operators may conflate with Facebook Messenger credentials | `channelSettingsModel.ts:100-107` |
| P1-2 | No Instagram OAuth / re-auth UI; expired/revoked tokens appear as generic **Error** | `ChannelSettingsPage.tsx` — no IG OAuth component; `statusHealthHint` only for ERROR generic text |
| P1-3 | UI note says runtime may use env config; READY badge does not show credential **source** (DB vs env) | `ChannelSettingsPage.tsx:429-431`; test feedback has no `source` field |
| P1-4 | No Instagram Business Account ID in UI | `INSTAGRAM_ACCOUNT_ID` / `providerIgAccountId` is **optional** at runtime (IG-AUTH-0); omission is UX gap not blocker |

### P2

| ID | Finding | Evidence |
|----|---------|----------|
| P2-1 | No Assisted Channel Connection Wizard for Instagram (Facebook only) | `FacebookConnectCard.tsx` gated `channel === "FACEBOOK"` |
| P2-2 | No webhook URL copy UI for Instagram operators | No matches in `src/ui` for IG webhook |
| P2-3 | Test connection failure messages provider-generic; no operator playbook link | `buildTestConnectionFeedback` |
| P2-4 | Missing unit test for SALES role on channel-settings API | `channelSettings.route.test.ts` covers MANAGER, not SALES |
| P2-5 | `providerAccountName` from successful test may overwrite label without showing IG username separately | `testChannelConnection.ts:66-67` server-side — UI displays account label field only |

## Scope confirmation

```text
Docs/report only.
No frontend or backend runtime change.
No test code change.
No schema/migration change.
No production credential/config change.
No OAuth implementation.
No deployment performed.
```

## Verification (pre-push)

Run after docs commit:

```bash
git diff --check
git diff --name-only origin/master...HEAD
git diff origin/master...HEAD | rg -n "Bearer |access_token[=:][[:space:]]*['\"][A-Za-z0-9]|APP_SECRET..."
```

## Cross-reference — IG-AUTH-0 (Agent A, merged on master)

Agent A IG-AUTH-0 current-state audit is now merged on master (PR #238, commit `2edfdc4` on branch `docs/ig-auth-0-current-state-audit`).

This UI/operator audit was cross-checked against that report. **Cross-confirmed:**

- No P0 findings (P0 **0**, P1 **8**, P2 **4** in backend audit)
- Shared webhook app secret is deployment-level architecture, not a tenant-isolation bypass
- Test connection / runtime split is **P1** (DB-only test vs worker `DB_WITH_ENV_FALLBACK`)
- Missing Instagram outbound `channel_connection_id` is an intra-tenant connection-binding risk and OAuth migration blocker (**P1**)
- No Instagram runtime refresh consumer
- Profile enrichment is **active at webhook** while avatar cache remains **parked**

IG-AUTH-0B (this deliverable) remains **in review** until PR #239 merges.

## Related artifacts

- `docs/instagram/ig-auth-ui-operator-matrix.md` — surface-by-surface matrix
- `docs/instagram/ig-oauth-ux-inputs.md` — OAuth state gap analysis
- Agent A: [`2026-06-17-ig-auth-0-current-state-audit.md`](../agent-a/2026-06-17-ig-auth-0-current-state-audit.md)
