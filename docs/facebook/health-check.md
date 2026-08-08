# Facebook Operational Health Checks

Reference for `POST /api/channel-connect/facebook/health` and Channel Settings health display.

---

## Endpoint

```text
POST /api/channel-connect/facebook/health
Authorization: ADMIN session required
```

Returns `FacebookOAuthHealthDto` with aggregate status and per-check results.

Implementation: `runFacebookOperationalHealth()` in `facebookOAuthOperationalHealth.ts`.

---

## All six checks

| Code | What it verifies | PASS means |
| --- | --- | --- |
| `CREDENTIAL_RESOLUTION` | Encrypted Page access token decrypts from `channel_credentials` | Token stored and readable |
| `PAGE_ACCESS` | Graph returns the expected Page ID and name | Token matches selected Page |
| `REQUIRED_TASKS` | Page has required Meta tasks from OAuth snapshot | Permissions sufficient for HubChat operations |
| `GRAPH_API` | Graph `/me` probe succeeds | API reachable with stored token |
| `PAGE_WEBHOOK_SUBSCRIPTION` | Page subscribed_apps includes Messenger + `feed` for HubChat App | Webhook fields complete |
| `RUNTIME_TEST_CONNECTION` | Worker resolver path can send/reach Graph with OAuth credential | End-to-end runtime credential works |

Checks run in order. Early credential failure blocks subsequent checks with "Blocked by credential resolution failure."

---

## PAGE_WEBHOOK_SUBSCRIPTION (detailed)

### What it does

1. GET Page `subscribed_apps` via Graph API
2. Evaluate against `META_APP_ID` and `FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS`
3. If incomplete → call `subscribeAndVerifyFacebookPageWebhook()` (GET → Union → POST → GET)
4. Report PASS or FAIL

### PASS criteria

- HubChat Meta App appears in Page subscribed apps
- `subscribed_fields` contains all five Messenger fields **and** `feed`
- Extra fields allowed

Operator message on PASS: *"Page webhook subscription verified for required Messenger and feed fields."*

### FAIL criteria

| Failure | Operator message (sanitized) | Typical cause |
| --- | --- | --- |
| App not subscribed | "Facebook Page is not subscribed to the HubChat Meta app." | Page never subscribed or wrong app |
| Fields incomplete | "Page webhook subscription is incomplete. Missing required Messenger and/or feed subscribed_fields." | `feed` or Messenger field missing |
| GET failed | "Could not read existing Page webhook subscription; refusing a destructive Messenger-only overwrite." | Token or Graph error on read |
| POST/verify failed | "Facebook Page webhook subscription failed." / verify failed | Graph write or post-verify read failed |
| Missing app config | verifyFailed | `META_APP_ID` not configured server-side |

### Operator actions on FAIL

1. **Do not** manually POST Messenger-only fields to Graph
2. Open Channel Settings → run health again (automatic repair attempts union POST)
3. If still FAIL, check Graph token validity (reconnect if `NEEDS_RECONNECT`)
4. For Default Tenant App Review Page only, use [ops-script.md](./ops-script.md) dry-run first
5. Escalate if GET succeeds but POST consistently fails (Meta permission or app config)

### Connection status impact

PR #314 rule: **`PAGE_WEBHOOK_SUBSCRIPTION` FAIL must never leave connection READY.**

| Prior state | Health result | New connection status | UI display |
| --- | --- | --- | --- |
| READY | subscription FAIL | ERROR | ERROR |
| AUTHORIZING | subscription FAIL | AUTHORIZING | CONNECTING |
| READY | all PASS | READY | CONNECTED |

---

## Aggregate health status

| healthStatus | When |
| --- | --- |
| `OK` | All checks PASS → connection promoted to READY |
| `RECONNECT_REQUIRED` | Provider-proven token/permission failure |
| `ERROR` | Blocking failure including subscription incomplete |
| `DEGRADED` | READY connection with non-blocking warnings |
| `UNKNOWN` | Initial / indeterminate |

---

## Display state mapping

| Condition | displayState |
| --- | --- |
| All PASS, READY | `CONNECTED` |
| RECONNECT_REQUIRED | `NEEDS_RECONNECT` |
| READY + degraded | `DEGRADED` |
| AUTHORIZING + incomplete subscription | `CONNECTING` |
| READY + subscription FAIL | `ERROR` |

---

## RUNTIME_TEST_CONNECTION notes

Requires `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` on the deployment.

Verifies the same credential path the worker uses for outbound send. FAIL here means inbound may work but outbound from Dashboard/worker may fail.

---

## What health does NOT check

- Meta App-level webhook URL configuration (Developer Console)
- Inbound message delivery end-to-end (use smoke tests)
- Queue/worker processing (use Ops Runtime dashboard)
- Meta App Review approval status

---

## Related documents

- [webhook-subscription.md](./webhook-subscription.md) — field requirements and union algorithm
- [oauth-flow.md](./oauth-flow.md) — READY gating
- [messenger-smoke-test.md](./messenger-smoke-test.md) — end-to-end Messenger verification
- [facebook-comment-smoke-test.md](./facebook-comment-smoke-test.md) — Comment verification
- [operator-runbook.md](./operator-runbook.md) — triage decision tree
