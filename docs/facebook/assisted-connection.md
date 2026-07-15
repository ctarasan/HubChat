# Assisted Connection — Facebook Operator Guide

Step-by-step guide for connecting a Facebook Page via HubChat Assisted Connection (Meta OAuth).

---

## When to use Assisted Connection

Use Assisted Connection when:

- Onboarding a new Facebook Page to HubChat
- Reconnecting after token expiry or revocation (`NEEDS_RECONNECT`)
- Replacing a manual token configuration with OAuth-managed credentials

Assisted Connection is enabled when `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` on the deployment.

---

## Operator journey

```text
Channel Settings (/dashboard/channel-settings)
      │
      ▼
Click "Connect Facebook" (or "Reconnect")
      │
      ▼
Meta OAuth consent screen
      │
      ▼
Return to HubChat → Page picker (if multiple Pages)
      │
      ▼
Select Page → Complete
      │
      ▼
Background: subscribeAndVerifyFacebookPageWebhook()
      │
      ▼
Health run → all six checks PASS
      │
      ▼
UI shows CONNECTED
```

---

## Step-by-step

### 1. Open Channel Settings

Navigate to `/dashboard/channel-settings` as ADMIN.

Confirm Facebook row shows Assisted Connection available (not manual-only).

### 2. Start connection

Click **Connect Facebook** (or **Reconnect** if `NEEDS_RECONNECT`).

You are redirected to Meta OAuth. Approve requested Page permissions.

### 3. Select Page

If you manage multiple Pages, HubChat shows a Page picker.

Select the correct Page. Confirm Page name and ID match expectations.

### 4. Wait for completion

After Page selection:

- HubChat stores encrypted Page access token
- Page webhook subscription is repaired (union-preserving)
- Operational health runs automatically

UI shows **CONNECTING** during this phase.

### 5. Verify CONNECTED

Success state:

- Display state: **CONNECTED**
- Connection status: **READY**
- Health: all checks **PASS**
- `providerPageId` and `providerAccountName` populated

If stuck on **CONNECTING** > 2 minutes, run health manually.

---

## Display states during connection

| UI state | Meaning | Operator action |
| --- | --- | --- |
| `NOT_CONNECTED` | No connection | Start Connect |
| `CONNECTING` | OAuth or health in progress | Wait; refresh health |
| `AWAITING_PAGE_SELECTION` | Pick a Page | Select correct Page |
| `CONNECTED` | Operational | None |
| `NEEDS_RECONNECT` | Token/permission failure | Click Reconnect |
| `ERROR` | Blocking failure | Check health checks; see runbook |
| `DEGRADED` | READY with warnings | Monitor; investigate failing non-block checks |

### PR #317: stale reconnect banner

During an active reconnect, UI should show **CONNECTING**, not a stale **NEEDS_RECONNECT** from a prior session. If you see reconnect banner while OAuth is actively in progress, refresh after callback completes.

---

## Health checks after connection

Click **Run health** or **Test connection** on the Facebook card.

All six checks must PASS for READY. Pay special attention to:

- `PAGE_WEBHOOK_SUBSCRIPTION` — confirms Messenger + `feed`
- `RUNTIME_TEST_CONNECTION` — confirms worker can use OAuth credential

See [health-check.md](./health-check.md).

---

## Reconnect procedure

When UI shows **NEEDS_RECONNECT**:

1. Do not delete the connection manually unless instructed
2. Click **Reconnect Facebook**
3. Complete Meta OAuth
4. Re-select Page if prompted
5. Confirm health PASS and **CONNECTED**

Common reconnect triggers:

- Meta error 190/102 (expired or invalid token)
- Missing required Page tasks
- Operator revoked app access in Meta settings

---

## What Assisted Connection configures automatically

| Item | Configured by |
| --- | --- |
| Page access token | OAuth → encrypted `channel_credentials` |
| Page subscribed_apps | `subscribeAndVerifyFacebookPageWebhook` |
| Connection status promotion | Operational health |
| `webhook_active` flag | OAuth complete / health (not manual script) |

Assisted Connection does **not** change Meta Developer Console app-level webhook URL. That must already point to HubChat production callback.

---

## Manual configuration (legacy)

If OAuth is disabled, operators may use manual token entry on Channel Settings. Manual path:

- Does not auto-repair Page subscription
- Requires separate verification of `subscribed_fields`
- Not recommended for new production Pages

---

## Safety rules

- Never share Page access tokens in chat or screenshots
- Use only authorized admin Facebook accounts
- Connect only intended tenant Pages (verify tenant context before connecting)
- For Default Tenant App Review Page, prefer Assisted Connection over manual script

---

## Related documents

- [oauth-flow.md](./oauth-flow.md) — lifecycle and status definitions
- [health-check.md](./health-check.md) — six health checks
- [operator-runbook.md](./operator-runbook.md) — failure recovery
- [../hubchat-facebook-oauth-staging-pilot-smoke-runbook.md](../hubchat-facebook-oauth-staging-pilot-smoke-runbook.md) — staging rollout discipline
