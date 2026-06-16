# Agent B Report — FB-OAUTH-1I Staging Environment Identity Banner

## Metadata

| Field | Value |
|---|---|
| Agent | B |
| Date | 2026-06-17 |
| Phase | FB-OAUTH-1I — Non-Production environment identity UI |
| Branch | `feature/fb-oauth-1i-staging-environment-banner` |
| Base | `master` @ `cebb2521f59b297c6545ec8844ffc4951951572a` |
| Prerequisites | [#229](https://github.com/ctarasan/HubChat/pull/229) preflight BLOCKED; [#230](https://github.com/ctarasan/HubChat/pull/230) UI smoke worksheet |

---

## Summary

Added a minimal **deployment environment banner** to authenticated dashboard pages so operators can distinguish isolated staging from Production before Facebook OAuth actions. **Not a backend security boundary.**

---

## Existing mechanism audit

**No prior environment banner** found. Searched for staging indicator, deployment label, `VERCEL_ENV` UI usage, and dashboard header notices — none existed. Reused `NEXT_PUBLIC_*` client config pattern from `sessionConfig.ts` and `dashboardPollGovernance.ts`.

---

## Selected config contract

| Variable | Scope | Values |
|----------|-------|--------|
| `NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_ENV` | Public, non-secret | `staging` \| `preview` \| `development` \| absent/`production` |
| `NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_LABEL` | Optional display override | Max 48 chars; sanitized (no secrets/URLs/credentials) |

**Production default:** absent or `production` → **no banner** (UI unchanged).

Agent A sets `NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_ENV=staging` on the **isolated staging deploy** only.

---

## Behavior

| Environment | Banner | Label | Warning |
|-------------|--------|-------|---------|
| Production (default) | Hidden | — | — |
| Staging | Visible | `STAGING` or custom label | Test environment — do not use real customer data |
| Preview | Visible | `PREVIEW` | Preview deployment — not for production use |
| Development | Visible | `DEVELOPMENT` | Development environment — not for production use |

---

## Placement

`DeploymentEnvironmentBanner` at top of main content on:

- `/dashboard/channel-settings` (above OAuth card) — **primary**
- Team Inbox, Team Members, Ops, Leads, Analytics, Work Queue, SLA Policy

---

## Accessibility / responsive

- `role="status"` + `aria-label` combining label and warning
- Text label (not color-only); distinct CSS per kind
- Wraps at ≤390px (`globals.css`)
- Does not cover nav or actions

---

## Files changed

| File | Change |
|------|--------|
| `src/ui/deploymentEnvironmentModel.ts` | Config contract + sanitization |
| `src/ui/DeploymentEnvironmentBanner.tsx` | Banner component |
| `src/ui/deploymentEnvironmentModel.test.ts` | Unit tests |
| `src/ui/ChannelSettingsPage.tsx` + 7 dashboard pages | Banner integration |
| `app/globals.css` | Banner styles |
| `docs/hubchat-facebook-oauth-ui-smoke-worksheet.md` | Pre-smoke evidence A0 |
| `docs/hubchat-smoke-test-inventory.md` | FB-OAUTH-1I entry |
| `docs/agent-reports/agent-b/2026-06-17-fb-oauth-1i-staging-environment-banner.md` | This report |

---

## Scope confirmation

- No backend/worker/migration changes
- No environment variables set in this task
- No OAuth or outbound execution
- No secrets in repository

**Banner is not authorization.** Client-side indicator only; does not replace backend gates.

---

## Handoff

Agent A FB-OAUTH-1G.1 should set on isolated staging deploy:

```
NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_ENV=staging
```

Optional: `NEXT_PUBLIC_HUBCHAT_DEPLOYMENT_LABEL=OAuth Pilot Staging`

---

## Prior

FB-OAUTH-1H ([#230](https://github.com/ctarasan/HubChat/pull/230)); FB-OAUTH-1G ([#229](https://github.com/ctarasan/HubChat/pull/229)).
