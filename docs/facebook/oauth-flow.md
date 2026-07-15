# Facebook OAuth Flow — Assisted Connection

How HubChat connects a Facebook Page via Meta OAuth and reaches operational READY state.

---

## Overview

Assisted Connection guides an operator through:

1. Meta OAuth authorization
2. Page selection
3. Page webhook subscription (GET → Union → POST → GET Verify)
4. Operational health validation
5. UI display state **CONNECTED**

Implementation: `facebookOAuthService.ts`, `facebookOAuthOperationalHealth.ts`, Channel Settings UI.

---

## Connection status lifecycle

Stored on `channel_connections.status`:

| Status | Meaning |
| --- | --- |
| `DRAFT` | Connection record created, not yet authorized |
| `AUTHORIZING` | OAuth in progress or awaiting health to promote to READY |
| `READY` | All operational health checks PASS; fully operational |
| `ERROR` | Blocking failure (e.g. incomplete webhook subscription on previously READY connection) |
| `RECONNECT_REQUIRED` | Provider-proven token or permission failure |
| `REVOKED` | Token revoked by Meta or operator |

Legacy intermediate statuses (`CONNECTED`, `WEBHOOK_CONFIGURED`, etc.) exist in schema but OAuth flow primarily uses `AUTHORIZING` → `READY`.

---

## UI display states

Derived by `deriveFacebookOAuthDisplayState()` — what the operator sees on Channel Settings:

| Display state | Typical underlying cause |
| --- | --- |
| `NOT_CONNECTED` | No Facebook connection |
| `CONNECTING` | OAuth transaction pending or health not yet PASS |
| `AWAITING_PAGE_SELECTION` | OAuth callback received; Page picker shown |
| `CONNECTED` | `READY` + health `OK` |
| `DEGRADED` | `READY` but some non-blocking health degradation |
| `NEEDS_RECONNECT` | Token expired, missing Page tasks, or provider error 190/102 |
| `ERROR` | Blocking failure including incomplete webhook subscription |

### PR #317 fix (stale reconnect banner)

During active OAuth (`AUTHORIZING`), stale `RECONNECT_REQUIRED` errors from a prior session must not block the UI. The service clears stale error state on `startReconnect` and OAuth complete so operators see **CONNECTING** instead of a false reconnect banner.

---

## OAuth transaction stages

| Stage | Meaning |
| --- | --- |
| `PENDING` | OAuth start initiated |
| `CALLBACK_RECEIVED` | Meta redirected with code |
| `PAGES_READY` | Page list fetched; operator selects Page |
| `COMPLETED` | Page selected and credential stored |
| `FAILED` / `EXPIRED` | Terminal failure |

---

## Health gating for READY

A connection reaches **READY** only when `POST /api/channel-connect/facebook/health` reports all checks **PASS**.

Key gate introduced in PR #314:

- **`PAGE_WEBHOOK_SUBSCRIPTION`** must PASS before READY is allowed
- Incomplete subscription downgrades a previously READY connection to **ERROR**

See [health-check.md](./health-check.md) for all six checks.

---

## Page webhook subscription during OAuth complete

When the operator completes Page selection, `facebookOAuthService` calls:

```text
subscribeAndVerifyFacebookPageWebhook()
  → GET /{page-id}/subscribed_apps
  → union existing + required fields
  → POST /{page-id}/subscribed_apps
  → GET verify
```

This uses the same union-preserving helper as operational health (PR #316). It never POSTs a Messenger-only field list.

---

## Operational health (runtime)

`POST /api/channel-connect/facebook/health` runs six checks on demand:

1. `CREDENTIAL_RESOLUTION`
2. `PAGE_ACCESS`
3. `REQUIRED_TASKS`
4. `GRAPH_API`
5. `PAGE_WEBHOOK_SUBSCRIPTION`
6. `RUNTIME_TEST_CONNECTION`

Health is re-run:

- After OAuth complete
- When operator clicks health refresh on Channel Settings
- As part of promotion to READY

If `PAGE_WEBHOOK_SUBSCRIPTION` fails verification, health attempts automatic repair via `subscribeAndVerifyFacebookPageWebhook` (same union algorithm).

---

## Reconnect flow

When health detects provider-proven failure (Graph error 190/102, missing Page tasks, invalid credential):

1. Connection status → `RECONNECT_REQUIRED`
2. UI → `NEEDS_RECONNECT`
3. Operator clicks reconnect → new OAuth flow
4. On success, health re-runs and promotes to READY when all checks PASS

---

## Feature flags

| Flag | Effect |
| --- | --- |
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | Shows Assisted Connection UI and OAuth routes |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Worker and `RUNTIME_TEST_CONNECTION` use OAuth credentials |

Both are environment-wide (per deployment), not per-tenant.

---

## Security rules

- Public OAuth DTOs must never contain access tokens, authorization codes, or encrypted credential blobs
- `assertFacebookOAuthPublicDtoSafe()` enforces this in tests
- Operators must not paste tokens into support channels

---

## Related documents

- [assisted-connection.md](./assisted-connection.md) — step-by-step operator journey
- [webhook-subscription.md](./webhook-subscription.md) — subscription field requirements
- [health-check.md](./health-check.md) — check definitions and operator actions
- [operator-runbook.md](./operator-runbook.md) — disconnect and recovery
