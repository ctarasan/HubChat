# Instagram OAuth — UX Migration Inputs (IG-AUTH-0B)

Analysis-only inputs for a future Instagram OAuth operator experience. **No mockups or implementation** in this deliverable.

Current baseline: **manual credentials** on Channel Settings (`ChannelSettingsPage.tsx`). Facebook reference: `FacebookConnectCard.tsx` + `/api/channel-connect/facebook/*`.

---

## Future operator states — gap analysis

| State | Current UI support | Current evidence | Gap | Operator action today | OAuth requirement | Backend dependency |
|-------|-------------------|------------------|-----|----------------------|-------------------|-------------------|
| `NOT_CONNECTED` | Partial | `NOT_CONFIGURED` badge, empty SET badges | No OAuth CTA | Enter secrets manually | Connect with Meta button | No Instagram OAuth routes in codebase |
| `CONNECTING` | No | — | No progress UI for IG | Save + test manually | OAuth redirect + session polling | OAuth transaction state (future) |
| `CONNECTED` | Partial | `READY` after test | Conflates manual test pass with OAuth connected | Test connection | Post-callback status card | Connection record READY |
| `TOKEN_EXPIRING` | No | — | No expiry countdown/warning | None | Banner + re-auth CTA | `token_expires_at` stored for CC rows; not enforced on IG outbound send (IG-AUTH-0) |
| `REAUTH_REQUIRED` | No | Generic `ERROR` | No dedicated re-auth flow | Re-enter access token manually | Reconnect banner (FB pattern) | Revoked/expired detection |
| `PERMISSION_MISSING` | No | Generic error text | Cannot distinguish scope errors | Read `lastError` | Permission checklist UI | Scope validation API |
| `ACCOUNT_MISMATCH` | No | Generic error | No wrong-IG-account state | Fix Page ID / token manually | Page/account picker | IG Business account linkage check (`verifyInstagramChannelHealth`) |
| `REVOKED` | No | `ERROR` | Same as generic failure | Re-enter token | Reconnect OAuth | No structured revoke code in UI contract |
| `DISCONNECTED` | Partial | `DISABLED` or cleared secrets | Not same as OAuth disconnect | Disable channel / clear secrets | Explicit disconnect action | Revoke token server-side |
| `TEST_FAILED` | Yes | `ERROR` + test feedback | No structured check list | Retry test | Health checks list (FB model) | `verifyInstagramChannelHealth` outcomes |
| `REFRESH_FAILED` | No | — | No refresh UX | Manual token update | Silent refresh + operator notify | **No Instagram runtime refresh consumer** (IG-AUTH-0) |

---

## Manual flow elements to replace or relocate

| Current element | Location | OAuth migration action |
|-----------------|----------|------------------------|
| Access token password field | Instagram card | Hide behind Advanced / manual fallback |
| App secret field | Instagram card | UI field for operator record; live webhook POST uses **ENV** `INSTAGRAM_APP_SECRET` / `FACEBOOK_APP_SECRET` (IG-AUTH-0 P1-1) |
| Verify token field | Instagram card | UI field for operator record; live webhook GET uses **ENV** verify tokens — DB copy does not drive ingress (IG-AUTH-0) |
| Facebook Page ID text input | Instagram card | Populate from OAuth Page selection; show IG username |
| Account label | Instagram card | Auto-fill from Graph `instagram_business_account` |
| Test connection button | Instagram card | Keep; may call OAuth-aware health endpoint |
| SET/EMPTY badges | Instagram card | Extend with `EXPIRED`/`REVOKED` if API adds states |
| Runtime env note | Page header | Update when IG OAuth is primary path |

---

## Recommended new UI surfaces (inputs only)

1. **InstagramConnectCard** — parallel to `FacebookConnectCard.tsx`
   - States: `NOT_CONNECTED`, `CONNECTING`, `CONNECTED`, `REAUTH_REQUIRED`, `TEST_FAILED`
   - Safe display: Page name, IG username, connection status, health checks — no tokens

2. **InstagramReconnectBanner** — parallel to `FacebookReconnectBanner.tsx`

3. **Connection identity row** — show `providerAccountName` + IG Business account ID (operator-safe) separate from Facebook Messenger card

4. **Credential source indicator** — `Manual` / `OAuth` / `Environment fallback` on test result (requires API field from Agent A)

5. **Webhook setup section** — copy webhook URL + verify token instructions (if not OAuth-managed)

---

## Facebook OAuth patterns to mirror

| Facebook pattern | File | Instagram applicability |
|------------------|------|-------------------------|
| OAuth start + redirect | `FacebookConnectCard.tsx` | High |
| Page selector | `FacebookPageSelector.tsx` | Medium — may need IG Business account picker |
| Health check list | `facebookConnectModel.ts` | High |
| Reconnect banner | `FacebookReconnectBanner.tsx` | High |
| Manual fallback collapsed | `details` Advanced setup | High |
| Status CSS classes | `facebookConnectStatusCssClass` | Reuse pattern |

---

## Operator copy risks to address

| Risk | Mitigation input |
|------|------------------|
| "Facebook Page ID" on Instagram card | Rename to "Linked Facebook Page ID" + IG Business account display |
| Shared Meta app confusion | Clarify Instagram Login vs Facebook Page token in operator docs |
| READY vs runtime env | Show credential source on successful test |
| No disconnect | Add explicit Disconnect with confirmation |

---

## API contracts likely needed (future OAuth — not in codebase)

Per IG-AUTH-0, no Instagram OAuth service exists today. Future implementation likely needs:

- `GET /api/channel-connect/instagram/status` — safe status DTO
- `POST /api/channel-connect/instagram/oauth/start`
- `GET /api/channel-connect/instagram/oauth/session`
- `POST /api/channel-connect/instagram/health`
- `POST /api/channel-connect/instagram/reconnect`
- Test-connection response extension: `credentialSource`, `connectionId`, structured `errorCode`

---

## E2E / test gaps for OAuth phase

- Instagram OAuth smoke worksheet (mirror `docs/hubchat-facebook-oauth-ui-smoke-worksheet.md`)
- Network panel assertions: no `access_token` in JSON responses
- OAuth redirect flow (staging Meta app)
- Reconnect + expired token simulation
- MANAGER/SALES still blocked from OAuth admin routes
